import ListPage from '../_shared/List/ListPage';
import type { ColumnIF } from '../_shared/List/ListTable';
import type { CustomerIF } from '../../types/customer';
import { PATHS, RESOURCE } from '../../variables';

// Also the small list on Home
export const customerColumns: ColumnIF<CustomerIF>[] = [
    { key: 'id', label: '#', className: 'id' },
    {
        key: 'name',
        label: 'customers.form.name',
        className: 'name',
        render: ({ name, contact }) => (contact ? `${name} (${contact})` : name),
    },
];

export const customerHref = ({ id }: CustomerIF, page = 1) => `${PATHS.CUSTOMER}${page}/${id}/`;

const Customers = () => (
    <ListPage<CustomerIF>
        resource={RESOURCE.CUSTOMERS}
        path={PATHS.CUSTOMERS}
        title="customers.plural"
        columns={customerColumns}
        rowHref={customerHref}
        addHref={(page) => `${PATHS.CUSTOMER}${page}/0/`}
        addTestId="add-customer"
        tableClassName="customers-table"
        deletable
    />
);

export default Customers;
