import { ProductForm } from './ProductForm';
import { useNavigate, useParams } from 'react-router';
import type { ProductIF } from '../../types';
import { getSingle } from '../../utils/Getters/getSingle';
import Loader from '../_shared/Loader/Loader';
import PageNotFound from '../PageNotFound/PageNotFound';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import '@css/shared/Form.sass';
import { PATHS, RESOURCE } from '../../variables';
import Header from '../_shared/Header/Header';
import { useEffect, useRef } from 'react';
import type { FormHandleIF } from '../../types/form';
import { useDeleteItem } from '../../hooks/useDeleteItem';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { visibleRowCount } from '../../shared/helpers';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { useButtonsHandler } from '../../hooks/useButtons';

const Product = () => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const { id: productId, page: rawPage } = useParams();
    const page = Number(rawPage || 1);
    const isNew = productId === '0';
    const formRef = useRef<FormHandleIF>(null);
    const { promptDelete } = useDeleteItem([RESOURCE.CUSTOMERS]);
    const queryClient = useQueryClient();
    const limit = visibleRowCount(false);
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();

    const { data: product, isLoading } = useQuery<ProductIF | null>({
        queryKey: [RESOURCE.PRODUCT, productId],
        queryFn: () => getSingle<ProductIF>({ id: Number(productId), type: RESOURCE.PRODUCT }),
        enabled: !isNew,
    });

    // Invalidate specific cache and list
    const invalidateCache = async () => {
        await queryClient.invalidateQueries({
            queryKey: [RESOURCE.PRODUCTS, limit, page, undefined, ''],
        });
    };

    // Set up header config
    useEffect(() => {
        updateTitle({
            title: isNew
                ? `${t('new')} ${t('products.singular')}`
                : `${t('products.singular')}${product ? ` - ${product.name}` : ''}`,
        });
    }, [isNew, product, t, updateTitle]);
    useEffect(() => {
        const saveButton = {
            label: 'button.save',
            onClick: () => formRef.current && formRef.current.submitSave(),
            dataTestId: 'save-product',
        };
        const goBackButton = {
            label: 'button.goBack',
            onClick: () => navigate(`${PATHS.PRODUCTS}${page}`),
            classname: 'secondary',
        };
        const deleteButton = {
            label: 'button.delete',
            onClick: () =>
                product
                    ? promptDelete({
                          id: product.id,
                          resource: RESOURCE.PRODUCTS,
                          page,
                          cache: () => invalidateCache(),
                      })
                    : null,
            classname: 'tertiary',
            dataTestId: 'delete-product',
        };
        updateButtons({ buttons: [saveButton, goBackButton, ...(product ? [deleteButton] : [])] });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateButtons, navigate, page, product, invalidateCache]);

    if (isLoading) return <Loader />;
    if (!isNew && !product) return <PageNotFound />;

    return (
        <>
            <Header />

            <section className="component product">
                <ProductForm
                    ref={formRef}
                    key={productId}
                    initialProduct={product ?? null}
                    isNew={isNew}
                    type={RESOURCE.PRODUCT}
                />
            </section>
        </>
    );
};

export default Product;
