import type { DataResponseIF } from '../../types';
import { useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getMultiple } from '../../utils/Getters/getMultiple';
import DeleteIcon from '../../assets/images/x.svg?react';
import { useDeleteItem } from '../../hooks/useDeleteItem';
import { PATHS, RESOURCE } from '../../variables';
import { useKeyword } from '../../hooks/useKeyword';
import { getSearch } from '../../utils/Getters/getSearch';
import DefaultList from '../_shared/DefaultList';
import NoEntries from '../_shared/NoEntries/NoEntries';
import Loader from '../_shared/Loader/Loader';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import type { CustomerIF } from '../../types/customer';
import { visibleRowCount } from '../../shared/helpers';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { useEffect } from 'react';
import type { HeaderIF } from '../../types/header';
import { useButtonsHandler } from '../../hooks/useButtons';

interface CustomersIF {
    compact?: boolean;
}

const Customers = ({ compact }: CustomersIF) => {
    const page = Number(useParams().page) || 1;
    const navigate = useNavigate();
    const { t } = useSafeTranslation();
    const { keyword, updateKeyword } = useKeyword();
    const { promptDelete } = useDeleteItem([RESOURCE.CUSTOMERS]);
    const limit = visibleRowCount(compact);
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();

    // Set up header config
    useEffect(() => {
        updateTitle({ title: t('customers.plural') });
    }, [t, updateTitle]);
    useEffect(() => {
        const searchButton = {
            label: 'button.search',
        };
        const addButton = {
            label: 'button.add',
            onClick: () => navigate(`${PATHS.CUSTOMER}${page}/0/`),
            dataTestId: 'add-customer',
        };

        updateButtons({ buttons: [searchButton, addButton] });
    }, [updateButtons, navigate, page]);
    const header: HeaderIF = {
        keyword: '',
        updateKeyword: updateKeyword,
    };

    // fetch customers
    const { data, isLoading: loading } = useQuery<DataResponseIF<CustomerIF>>({
        queryKey: [RESOURCE.CUSTOMERS, limit, page, compact, keyword],
        queryFn: () => {
            if (keyword) {
                return getSearch({ keyword, resource: RESOURCE.CUSTOMERS, page, limit });
            }

            return getMultiple({ path: PATHS.CUSTOMERS, page, compact, limit });
        },
        placeholderData: keepPreviousData,
    });
    const { resource: customers, meta } = data || {};

    const customersTable = () => {
        if (!customers) {
            return '';
        }

        const handleViewClick = (id: number) => {
            navigate(`${PATHS.CUSTOMER}${page}/${id}/`);
        };

        return Object.values(customers).map((customer: CustomerIF, index) => {
            const { id, name, contact } = customer;

            return (
                <tr className="row" key={index}>
                    <td onClick={() => handleViewClick(id)} className="id">
                        {id}
                    </td>
                    <td onClick={() => handleViewClick(id)} className="name">
                        {name}
                        {contact && ` (${contact})`}
                    </td>
                    {!compact && (
                        <td className="actions">
                            <DeleteIcon
                                onClick={() =>
                                    promptDelete({ id, resource: RESOURCE.CUSTOMERS, page })
                                }
                            />
                        </td>
                    )}
                </tr>
            );
        });
    };

    const showList = () => {
        if (!customers?.length) {
            return <NoEntries />;
        }

        return (
            <table className={`general-table customers-table${compact ? ' compact' : ''}`}>
                <thead>
                    <tr>
                        <th className="id">#</th>
                        <th className="name">Name</th>
                        {!compact && <th className="actions" />}
                    </tr>
                </thead>
                <tbody>{customersTable()}</tbody>
            </table>
        );
    };

    if (loading) {
        return <Loader />;
    }

    return (
        <DefaultList
            list="customers"
            loader={loading}
            renderer={showList}
            meta={meta}
            compact={compact}
            path={PATHS.CUSTOMERS}
            header={header}
        />
    );
};

export default Customers;
