import { lazy, useEffect } from 'react';
import DefaultList from '../_shared/DefaultList';
import NoEntries from '../_shared/NoEntries/NoEntries';
import type { DataResponseIF, InvoiceIF, InvoiceWithCustomerIF } from '../../types';
import { useNavigate, useParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getMultiple } from '../../utils/Getters/getMultiple';
import Loader from '../_shared/Loader/Loader';
import { PATHS, RESOURCE } from '../../variables';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useKeyword } from '../../hooks/useKeyword';
import { getSearch } from '../../utils/Getters/getSearch';
import type { CustomerIF } from '../../types/customer';
import { visibleRowCount } from '../../shared/helpers';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import type { HeaderIF } from '../../types/header';
import { useButtonsHandler } from '../../hooks/useButtons';
import styles from './Invoices.module.sass';

const Lock = lazy(() => import('../_shared/Icons/Lock'));

interface WorksheetsIF {
    compact?: boolean;
    existingCustomer?: CustomerIF;
}

const Invoices = ({ compact, existingCustomer }: WorksheetsIF) => {
    const page = Number(useParams().page) || 1;
    const navigate = useNavigate();
    const { t } = useSafeTranslation();
    const { keyword, updateKeyword } = useKeyword();
    const limit = visibleRowCount(compact);
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();
    const enableUpdates = !existingCustomer || !existingCustomer.id;

    // Set up header config
    useEffect(() => {
        if (!enableUpdates) {
            return;
        }

        updateTitle({ title: t('invoices.plural') });
    }, [t, updateTitle]);
    useEffect(() => {
        if (!enableUpdates) {
            return;
        }

        const searchButton = {
            label: 'button.search',
        };
        const addButton = {
            label: 'button.add',
            onClick: () => navigate(`${PATHS.INVOICE}${page}/0/`),
            dataTestId: 'add-invoice',
        };

        updateButtons({ buttons: [searchButton, addButton] });
    }, [updateButtons, navigate, page]);
    const header: HeaderIF = {
        keyword: '',
        updateKeyword: updateKeyword,
    };

    // fetch products
    const { data, isLoading: loading } = useQuery<DataResponseIF<InvoiceIF>>({
        queryKey: [RESOURCE.INVOICES, limit, page, compact, keyword, existingCustomer?.id],
        queryFn: () => {
            if (keyword) {
                return getSearch({ keyword, resource: RESOURCE.INVOICES, page, limit });
            }

            return getMultiple({
                path: PATHS.INVOICES,
                page,
                compact,
                id: existingCustomer?.id,
                limit,
            });
        },
        placeholderData: keepPreviousData,
    });
    const { resource: invoices, meta } = data || {};
    const showLock = invoices?.some((item) => item.locked === 1);

    const showTable = () => {
        // TODO "as" is not "as good" as it can be
        const invoiceData = invoices as InvoiceWithCustomerIF[];

        if (!invoices) {
            return '';
        }

        const handleViewClick = (id: number) => {
            navigate(`${PATHS.INVOICE}${page}/${id}/`);
        };

        return Object.values(invoiceData).map((item: InvoiceWithCustomerIF, index) => {
            const { id, number, name, total, locked } = item;

            return (
                <tr className="row" key={index}>
                    {showLock && <td className={styles.locked}>{locked ? <Lock /> : null}</td>}
                    <td onClick={() => handleViewClick(id)} className="id">
                        {number}
                    </td>
                    {existingCustomer && existingCustomer.id ? (
                        ''
                    ) : (
                        <td onClick={() => handleViewClick(id)} className="name">
                            {name}
                        </td>
                    )}
                    <td onClick={() => handleViewClick(id)} className="items">
                        {total}
                    </td>
                </tr>
            );
        });
    };

    const showList = () => {
        if (!invoices?.length) {
            return <NoEntries />;
        }

        const cssClass = ['general-table', compact ? 'compact' : ''].filter(Boolean).join(' ');

        return (
            <table className={cssClass}>
                <thead>
                    <tr>
                        {showLock && <th></th>}
                        <th className="id">#</th>
                        {existingCustomer && existingCustomer.id ? (
                            ''
                        ) : (
                            <th className="name">{t('invoices.form.customer')}</th>
                        )}
                        <th className="items">{t('invoices.form.products')}</th>
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
            list="invoices"
            loader={loading}
            renderer={showList}
            meta={meta}
            compact={compact}
            path={PATHS.INVOICES}
            header={header}
        />
    );
};

export default Invoices;
