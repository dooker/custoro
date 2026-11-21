import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Header from '../_shared/Header/Header';
import ListFrame from '../_shared/List/ListFrame';
import ListTable, { type ColumnIF } from '../_shared/List/ListTable';
import DeleteButton from '../_shared/List/DeleteButton';
import Dropdown from './Dropdown';
import { useAuth } from '../../contexts/Auth';
import { useDeleteItem } from '../../hooks/useDeleteItem';
import { useWorksheetActions } from '../../hooks/useWorksheetActions';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useListParams } from '../../hooks/useListParams';
import { useResourceList } from '../../hooks/useResourceList';
import { getSingle } from '../../utils/Getters/getSingle';
import { formatPrice } from '../../utils/invoiceTotals';
import { Axios } from '../../Axios';
import type { InvoiceIF, WorksheetIF } from '../../types';
import type { CustomerIF } from '../../types/customer';
import type { HeaderButtonIF } from '../../types/header';
import { endpoint, PATHS, RESOURCE } from '../../variables';
import { pageAfterDelete, pageFromParam } from '../_shared/List/listLogic';
import {
    invoiceItems,
    invoiceNumberOf,
    isAllSelected,
    selectableIds,
    toggledAll,
} from './worksheetSelection';
import styles from './WorksheetsPerCustomer.module.sass';

// A customer's worksheets: also the small list on the customer's page, without the discount price
export const customerWorksheetColumns = (showDiscount: boolean): ColumnIF<WorksheetIF>[] => [
    { key: 'code', label: '#', className: 'id' },
    {
        key: 'name',
        label: 'worksheets.form.products',
        className: 'name',
        render: ({ name }) => <span>{name}</span>,
    },
    {
        key: 'price',
        label: 'worksheets.form.price',
        className: 'items',
        render: ({ price }) => formatPrice(price),
    },
    ...(showDiscount
        ? [
              {
                  key: 'discountPrice',
                  label: 'worksheets.form.discountPrice',
                  className: 'items',
                  render: ({ discountPrice }: WorksheetIF) => formatPrice(discountPrice),
              },
          ]
        : []),
    { key: 'quantity', label: 'worksheets.form.quantity', className: 'items' },
];

// A worksheet on an invoice cannot be changed, so it does not open
export const customerWorksheetHref = (
    { id, invoice }: WorksheetIF,
    customerId: number | string,
    page = 1,
    worksheetPage = 1
) => (invoice ? undefined : `${PATHS.WORKSHEET}${page}/${customerId}/${worksheetPage}/${id}/`);

export const invoicedRow = ({ invoice }: WorksheetIF) => (invoice ? `disabled ${styles.row}` : '');

/**
 * One customer's worksheets: pick some and put them on a new or an existing invoice. The address
 * is /worksheets/<page of the customer list>/<customer>/<page of this list>/.
 */
const WorksheetsPerCustomer = () => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { page: rawPage, customerId = '', worksheetPage } = useParams();
    const page = pageFromParam(rawPage);
    const currentPage = pageFromParam(worksheetPage);
    const pageHref = (number: number) => `${PATHS.WORKSHEETS}${page}/${customerId}/${number}/`;
    const { keyword, size, setKeyword, setSize, withParams } = useListParams(pageHref);
    const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false);
    const { user } = useAuth();
    const showDiscount = !!Number(user?.discount);
    const listKey = [RESOURCE.WORKSHEETS_PER_CUSTOMER];
    const { promptDelete } = useDeleteItem(listKey);
    const { selectedCheckboxes, setSelectedCheckboxes, doInvoice, toggleCheckbox } =
        useWorksheetActions(Number(customerId), listKey);

    const query = useResourceList<WorksheetIF>(
        {
            resource: RESOURCE.WORKSHEETS_PER_CUSTOMER,
            path: PATHS.WORKSHEETS,
            page: currentPage,
            limit: size,
            keyword,
            params: { customer: customerId },
        },
        { prefetchNext: true }
    );
    const worksheets = query.data?.resource ?? [];

    const { data: customer } = useQuery<CustomerIF | null>({
        queryKey: [RESOURCE.CUSTOMER, customerId],
        queryFn: () => getSingle<CustomerIF>({ id: Number(customerId), type: RESOURCE.CUSTOMER }),
    });

    // The customer's invoices and the next invoice number, for "Add to invoice"
    const { data: customerInvoices } = useQuery<InvoiceIF[]>({
        queryKey: [RESOURCE.INVOICES, 'all', Number(customerId)],
        queryFn: async () =>
            (await Axios.get(`${endpoint}${PATHS.INVOICE}all/${customerId}/`)).data.data || [],
        enabled: !!customerId,
    });
    const { data: lastInvoiceNumber } = useQuery<string | null>({
        queryKey: [RESOURCE.INVOICES, 'last'],
        queryFn: async () => (await Axios.get(`${endpoint}${PATHS.INVOICE}last/`)).data.data,
        enabled: !!customerId,
    });

    const addToInvoice = (invoiceId?: number) => {
        doInvoice({
            invoiceId,
            customerId: Number(customerId),
            items: invoiceItems(selectedCheckboxes, worksheets),
        });
    };

    const selectable = selectableIds(worksheets);
    const allSelected = isAllSelected(selectable, selectedCheckboxes);
    const toggleAll = () => setSelectedCheckboxes(toggledAll(selectable, selectedCheckboxes));

    // Deleting the last row of a page goes to the page before; the customer list's counts change
    const remove = (id: number) => {
        const target = pageAfterDelete(currentPage, worksheets.length);

        promptDelete({
            id,
            resource: RESOURCE.WORKSHEETS_PER_CUSTOMER,
            page: target,
            returnTo: withParams(pageHref(target)),
            cache: () => void queryClient.invalidateQueries({ queryKey: [RESOURCE.WORKSHEETS] }),
        });
    };

    const invoiceNumber = (invoice?: number) => invoiceNumberOf(customerInvoices, invoice);

    const buttons: HeaderButtonIF[] = [
        {
            label: 'button.add',
            onClick: () => navigate(`${PATHS.WORKSHEET}${page}/${customerId}/${currentPage}/0/`),
        },
        ...(selectedCheckboxes.length
            ? [
                  {
                      label: 'button.toInvoice',
                      onClick: () => setShowInvoiceDropdown(!showInvoiceDropdown),
                      dropdown: (
                          <Dropdown
                              addToInvoice={addToInvoice}
                              lastInvoiceId={Number(lastInvoiceNumber)}
                              customerInvoices={customerInvoices}
                          />
                      ),
                  },
              ]
            : []),
        {
            label: 'button.list',
            onClick: () => navigate(`${PATHS.WORKSHEETS}${page}/`),
            classname: 'secondary',
        },
    ];

    return (
        <>
            <Header
                title={`${t('worksheets.plural')}${customer ? ` - ${customer.name}` : ''}`}
                search={{ value: keyword, onChange: setKeyword }}
                buttons={buttons}
            />

            <ListFrame
                resource={RESOURCE.WORKSHEETS_PER_CUSTOMER}
                query={query}
                page={currentPage}
                pageHref={(number) => withParams(pageHref(number))}
                pageSize={{ value: size, onChange: setSize }}
            >
                {(rows) => (
                    <ListTable<WorksheetIF>
                        columns={customerWorksheetColumns(showDiscount)}
                        rows={rows}
                        rowKey={(row) => row.id}
                        rowHref={(row) => customerWorksheetHref(row, customerId, page, currentPage)}
                        rowClassName={invoicedRow}
                        className="worksheet-table worksheets-per-customer"
                        actionsHead={
                            selectable.length ? (
                                <input
                                    type="checkbox"
                                    aria-label={t('button.toInvoice')}
                                    checked={allSelected}
                                    onChange={toggleAll}
                                />
                            ) : null
                        }
                        actions={(row) => (
                            <span className={styles.actions}>
                                {row.invoice ? (
                                    invoiceNumber(row.invoice) ? (
                                        <Link to={`${PATHS.INVOICE}1/${row.invoice}/`}>
                                            {invoiceNumber(row.invoice)}
                                        </Link>
                                    ) : null
                                ) : (
                                    <input
                                        type="checkbox"
                                        aria-label={row.name}
                                        checked={selectedCheckboxes.includes(row.id)}
                                        onChange={() => toggleCheckbox(row.id)}
                                    />
                                )}
                                <DeleteButton onClick={() => remove(row.id)} />
                            </span>
                        )}
                    />
                )}
            </ListFrame>
        </>
    );
};

export default WorksheetsPerCustomer;
