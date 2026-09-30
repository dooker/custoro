import type { DataResponseIF, ProductIF } from '../../types';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/Auth';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { getMultiple } from '../../utils/Getters/getMultiple';
import DeleteIcon from '../../assets/images/x.svg?react';
import { useDeleteItem } from '../../hooks/useDeleteItem';
import { PATHS, RESOURCE } from '../../variables';
import { useKeyword } from '../../hooks/useKeyword';
import { getSearch } from '../../utils/Getters/getSearch';

import DefaultList from '../_shared/DefaultList';
import NoEntries from '../_shared/NoEntries/NoEntries';
import Loader from '../_shared/Loader/Loader';
import { visibleRowCount } from '../../shared/helpers';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { useEffect } from 'react';
import { useButtonsHandler } from '../../hooks/useButtons';
import type { HeaderIF } from '../../types/header';

interface ProductsIF {
    compact?: boolean;
}

const Products = ({ compact }: ProductsIF) => {
    const page = Number(useParams().page) || 1;
    const navigate = useNavigate();
    const { t } = useSafeTranslation();
    const { user } = useAuth();
    const { promptDelete } = useDeleteItem([RESOURCE.PRODUCTS]);
    const { keyword, updateKeyword } = useKeyword();
    const limit = visibleRowCount(compact);
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();

    // Set up header config
    useEffect(() => {
        updateTitle({ title: t('products.plural') });
    }, [t, updateTitle]);
    useEffect(() => {
        const searchButton = {
            label: 'button.search',
        };
        const addButton = {
            label: 'button.add',
            onClick: () => navigate(`${PATHS.PRODUCT}${page}/0/`),
            dataTestId: 'add-product',
        };

        updateButtons({ buttons: [searchButton, addButton] });
    }, [updateButtons, navigate, page]);
    const header: HeaderIF = {
        keyword: '',
        updateKeyword: updateKeyword,
    };
    const showDiscount = user && user.discount;

    // fetch products
    const { data, isLoading: loading } = useQuery<DataResponseIF<ProductIF>>({
        queryKey: [RESOURCE.PRODUCTS, limit, page, compact, keyword],
        queryFn: () => {
            if (keyword) {
                return getSearch({ keyword, resource: RESOURCE.PRODUCTS, page, limit });
            }

            return getMultiple({ path: PATHS.PRODUCTS, page, compact, limit });
        },
        placeholderData: keepPreviousData,
    });
    const { resource: products, meta } = data || {};

    const showTable = () => {
        const navigationPage = products && products.length === 1 && page > 1 ? page - 1 : page;

        if (!products) {
            return '';
        }

        const handleViewClick = (id: number) => {
            navigate(`${PATHS.PRODUCT}${page}/${id}/`);
        };

        return Object.values(products).map((product: ProductIF, index) => {
            const { id, code, name, price, discountPrice, unit } = product;

            return (
                <tr className="row" key={index}>
                    <td onClick={() => handleViewClick(id)} className="id">
                        {code}
                    </td>
                    <td onClick={() => handleViewClick(id)} className="name">
                        <span>{name}</span>
                    </td>
                    <td onClick={() => handleViewClick(id)} className="items">
                        {Number(price).toFixed(2)}
                    </td>
                    {showDiscount ? (
                        <td onClick={() => handleViewClick(id)} className="items">
                            {Number(discountPrice).toFixed(2)}
                        </td>
                    ) : (
                        ''
                    )}
                    <td onClick={() => handleViewClick(id)} className="items">
                        {unit}
                    </td>
                    {!compact && (
                        <td className="actions">
                            <DeleteIcon
                                onClick={() =>
                                    promptDelete({
                                        id,
                                        resource: RESOURCE.PRODUCTS,
                                        page: navigationPage,
                                    })
                                }
                            />
                        </td>
                    )}
                </tr>
            );
        });
    };

    const showList = () => {
        if (!products?.length) {
            return <NoEntries />;
        }

        return (
            <table className={`general-table products-table${compact ? ' compact' : ''}`}>
                <thead>
                    <tr>
                        <th className="id">#</th>
                        <th className="name">{t('products.form.name')}</th>
                        <th className="items">{t('products.form.price')}</th>
                        {showDiscount ? (
                            <th className="items">{t('products.form.discountPrice')}</th>
                        ) : (
                            ''
                        )}
                        <th className="items">{t('products.form.unit')}</th>
                        {!compact && <th className="actions" />}
                    </tr>
                </thead>
                <tbody>{showTable()}</tbody>
            </table>
        );
    };

    if (loading) {
        return <Loader />;
    }

    return (
        <DefaultList
            list="products"
            loader={loading}
            renderer={showList}
            meta={meta}
            compact={compact}
            path={PATHS.PRODUCTS}
            header={header}
        />
    );
};

export default Products;
