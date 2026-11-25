import ListPage from '../_shared/List/ListPage';
import type { ColumnIF } from '../_shared/List/ListTable';
import type { InvoiceWithCustomerIF } from '../../types';
import { PATHS, RESOURCE } from '../../variables';
import Lock from '../_shared/Icons/Lock';
import styles from './Invoices.module.sass';

// Also the small lists on Home and on a customer's page (without the customer column there). The
// lock column only when the rows have a paid invoice.
export const invoiceColumns =
    (withCustomer = true) =>
    (rows: InvoiceWithCustomerIF[]): ColumnIF<InvoiceWithCustomerIF>[] => [
        ...(rows.some((row) => row.locked === 1)
            ? [
                  {
                      key: 'locked',
                      className: styles.locked,
                      render: ({ locked }: InvoiceWithCustomerIF) => (locked ? <Lock /> : null),
                  },
              ]
            : []),
        { key: 'number', label: '#', className: 'id' },
        ...(withCustomer
            ? [{ key: 'name', label: 'invoices.form.customer', className: 'name' }]
            : []),
        { key: 'total', label: 'invoices.form.products', className: 'items' },
    ];

export const invoiceHref = ({ id }: InvoiceWithCustomerIF, page = 1) =>
    `${PATHS.INVOICE}${page}/${id}/`;

const Invoices = () => (
    <ListPage<InvoiceWithCustomerIF>
        resource={RESOURCE.INVOICES}
        path={PATHS.INVOICES}
        title="invoices.plural"
        columns={invoiceColumns()}
        rowHref={invoiceHref}
        addHref={(page) => `${PATHS.INVOICE}${page}/0/`}
        addTestId="add-invoice"
    />
);

export default Invoices;
