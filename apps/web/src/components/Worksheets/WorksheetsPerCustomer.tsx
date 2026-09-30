import { useEffect, useState } from 'react';
import { RESOURCE, endpoint, PATHS } from '../../variables';
import { useNavigate, useParams } from 'react-router-dom';
import DefaultList from '../_shared/DefaultList';
import NoEntries from '../_shared/NoEntries/NoEntries';
import type { DataResponseIF, InvoiceIF, WorksheetIF } from '../../types';
import { useAuth } from '../../contexts/Auth';
import { useDeleteItem } from '../../hooks/useDeleteItem';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSingle } from '../../utils/Getters/getSingle';
import { getMultiple } from '../../utils/Getters/getMultiple';
import { useWorksheetActions } from '../../hooks/useWorksheetActions';

import WorksheetRow from './WorksheetRow';
import { useKeyword } from '../../hooks/useKeyword';
import { getSearch } from '../../utils/Getters/getSearch';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import Dropdown from './Dropdown';
import { Axios } from '../../Axios';
import type { CustomerIF } from '../../types/customer';
import { visibleRowCount } from '../../shared/helpers';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { useButtonsHandler } from '../../hooks/useButtons';
import type { HeaderIF } from '../../types/header';

interface WorksheetsIF {
    existingCustomer?: CustomerIF;
    compact?: boolean;
}

const WorksheetsPerCustomer = ({ existingCustomer, compact }: WorksheetsIF) => {
    const page = Number(useParams().page) || 1;
    const navigate = useNavigate();
    const { t } = useSafeTranslation();
    const { customerId: customerIdParam, worksheetPage } = useParams();
    const currentWorksheetPage = Number(worksheetPage) || 1;
    const customerId = existingCustomer?.id.toString() || customerIdParam;
    const { keyword, updateKeyword } = useKeyword();
    const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false);
    const { user } = useAuth();
    const { discount } = user || {};
    const limit = visibleRowCount(compact);
    const worksheetQueryKey = [
        RESOURCE.WORKSHEETS_PER_CUSTOMER,
        String(limit),
        String(customerId),
        String(worksheetPage),
        String(currentWorksheetPage),
        keyword,
    ];
    const { promptDelete } = useDeleteItem(worksheetQueryKey);
    const { selectedCheckboxes, setSelectedCheckboxes, doInvoice, toggleCheckbox } =
        useWorksheetActions(Number(customerId), worksheetQueryKey);
    const queryClient = useQueryClient();
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();
    const enableUpdates = !existingCustomer || !existingCustomer.id;

    // fetch worksheets
    const { data, isLoading: loading } = useQuery<DataResponseIF<WorksheetIF>>({
        queryKey: worksheetQueryKey,
        queryFn: () => {
            if (keyword) {
                return getSearch({
                    keyword,
                    resource: RESOURCE.WORKSHEETS,
                    page,
                    customer: customerId,
                    limit,
                });
            }

            return getMultiple({
                path: PATHS.WORKSHEETS,
                page: Number(worksheetPage),
                customerId: Number(customerId),
                limit,
            });
        },
        placeholderData: keepPreviousData,
    });
    const { resource: worksheets, meta } = data || {};

    // fetch customer
    const { data: customer, isLoading: customerLoading } = useQuery<CustomerIF | null>({
        queryKey: [RESOURCE.CUSTOMER, customerId],
        queryFn: () => getSingle<CustomerIF>({ id: Number(customerId), type: RESOURCE.CUSTOMER }),
    });

    // fetch customer invoices
    // TODO [KAN-161] refactor so this is fired not on initial load but after load or only when user can add to invoice
    const { data: customerInvoices, isLoading: customerInvoicesLoading } = useQuery<
        InvoiceIF[] | null
    >({
        queryKey: [RESOURCE.INVOICES, 'all', Number(customerId)],
        queryFn: async () => {
            const response = await Axios.get(`${endpoint}${PATHS.INVOICE}all/${customerId}/`);

            return response.data.data || [];
        },
        enabled: !!customerId && !compact,
    });
    const checkboxes = worksheets?.map((item) => item.id);

    // fetch last invoice number
    const { data: lastInvoiceNumber, isLoading: lastInvoiceNumberLoading } = useQuery<
        InvoiceIF[] | null
    >({
        queryKey: [RESOURCE.INVOICES, 'last'],
        queryFn: async () => {
            const response = await Axios.get(`${endpoint}${PATHS.INVOICE}last/`);

            return response.data.data;
        },
        enabled: !!customerId && !compact,
    });

    const addToInvoice = (id?: number) => {
        const items = selectedCheckboxes.map((item) => {
            const worksheet = worksheets?.find((ws) => ws.id === item);

            return {
                worksheetId: item,
                productId: worksheet?.product_id || 0,
                quantity: worksheet?.quantity || 0,
            };
        });

        doInvoice({
            invoiceId: id,
            customerId: Number(customerId),
            items,
        });
    };

    // Set up header config
    useEffect(() => {
        if (!enableUpdates) {
            return;
        }

        updateTitle({ title: `${t('worksheets.plural')}${customer ? ` - ${customer.name}` : ''}` });
    }, [customer, t, updateTitle]);
    useEffect(() => {
        if (!enableUpdates) {
            return;
        }

        const searchButton = {
            label: 'button.search',
        };
        const addButton = {
            label: 'button.add',
            onClick: () =>
                navigate(`${PATHS.WORKSHEET}${page}/${customerId}/${currentWorksheetPage}/0/`),
        };
        const invoiceButton = {
            label: 'button.toInvoice',
            onClick: () => setShowInvoiceDropdown(!showInvoiceDropdown),
            dropdown: (
                <Dropdown
                    addToInvoice={addToInvoice}
                    lastInvoiceId={Number(lastInvoiceNumber)}
                    customerInvoices={customerInvoices}
                />
            ),
        };
        const listButton = {
            label: 'button.list',
            onClick: () => navigate(`${PATHS.WORKSHEETS}${page}/`),
            classname: 'secondary',
        };

        updateButtons({
            buttons: [
                searchButton,
                addButton,
                ...(selectedCheckboxes.length ? [invoiceButton] : []),
                listButton,
            ],
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        updateButtons,
        navigate,
        page,
        customerId,
        currentWorksheetPage,
        showInvoiceDropdown,
        selectedCheckboxes.length,
        lastInvoiceNumber,
        customerInvoices,
    ]);
    const header: HeaderIF = {
        keyword: '',
        updateKeyword: updateKeyword,
    };

    const isAllSelected =
        checkboxes && checkboxes.length > 0 && selectedCheckboxes.length === checkboxes.length;
    const toggleAll = () => {
        if (isAllSelected || !checkboxes) {
            setSelectedCheckboxes([]);
        } else {
            setSelectedCheckboxes(checkboxes.map((id) => id));
        }
    };

    // Invalidate specific cache and list
    const invalidateCache = async () => {
        await queryClient.invalidateQueries({
            queryKey: [RESOURCE.WORKSHEETS, page, currentWorksheetPage, Number(customerId)],
        });
    };

    const showTable = () => {
        const navigationPage =
            worksheets && worksheets.length === 1 && currentWorksheetPage > 1
                ? currentWorksheetPage - 1
                : currentWorksheetPage;

        if (!worksheets) return null;

        const handleViewClick = (id: number) => {
            navigate(`${PATHS.WORKSHEET}${page}/${customerId}/${worksheetPage}/${id}/`);
        };

        return (compact ? worksheets.slice(0, 5) : worksheets).map((item) => (
            <WorksheetRow
                key={item.id}
                item={item}
                isSelected={selectedCheckboxes.includes(item.id)}
                onToggle={toggleCheckbox}
                onView={handleViewClick}
                onDelete={(id) =>
                    promptDelete({
                        id,
                        resource: RESOURCE.WORKSHEETS_PER_CUSTOMER,
                        page: navigationPage,
                        customer: Number(customerId),
                        parentPage: currentWorksheetPage,
                        cache: () => invalidateCache(),
                    })
                }
                customerInvoices={customerInvoices as InvoiceIF[]}
                hasDiscount={!!discount}
                compact={compact}
            />
        ));
    };

    const showList = () => {
        if (!worksheets?.length) {
            return <NoEntries />;
        }

        return (
            <table className={`general-table worksheet-table worksheets-per-customer`}>
                <thead>
                    <tr>
                        <th className="id">#</th>
                        <th className="name">{t('worksheets.form.products')}</th>
                        <th className="items">{t('worksheets.form.price')}</th>
                        {discount && !compact && (
                            <th className="items">{t('worksheets.form.discountPrice')}</th>
                        )}
                        <th className="items">{t('worksheets.form.quantity')}</th>
                        {!compact && (
                            <th className="actions">
                                {worksheets?.map((item) => !item.invoice).filter(Boolean).length ? (
                                    <input type="checkbox" onChange={() => toggleAll()} />
                                ) : null}
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody>{showTable()}</tbody>
            </table>
        );
    };

    // TODO refactor these into checkbox logic instead wait for these for initial render
    // console.log(customerLoading, customerInvoicesLoading, lastInvoiceNumberLoading);

    return (
        <DefaultList
            list={RESOURCE.WORKSHEETS_PER_CUSTOMER}
            loader={
                loading || customerLoading || customerInvoicesLoading || lastInvoiceNumberLoading
            }
            renderer={showList}
            meta={meta}
            path={PATHS.WORKSHEETS}
            compact={compact}
            header={header}
        />
    );
};

export default WorksheetsPerCustomer;
