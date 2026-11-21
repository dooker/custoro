import ListPage from '../_shared/List/ListPage';
import type { ColumnIF } from '../_shared/List/ListTable';
import type { WorksheetIF } from '../../types';
import { PATHS, RESOURCE } from '../../variables';

// The customers with worksheets, newest first; also the small list on Home. A row's id is the
// customer's.
export const worksheetCustomerColumns: ColumnIF<WorksheetIF>[] = [
    { key: 'name', label: 'worksheets.form.customer', className: 'name' },
    { key: 'worksheet_count', label: 'worksheets.form.products', className: 'items' },
];

export const worksheetCustomerHref = ({ id }: WorksheetIF, page = 1) =>
    `${PATHS.WORKSHEETS}${page}/${id}/1/`;

const Worksheets = () => (
    <ListPage<WorksheetIF>
        resource={RESOURCE.WORKSHEETS}
        path={PATHS.WORKSHEETS}
        title="worksheets.plural"
        columns={worksheetCustomerColumns}
        rowHref={worksheetCustomerHref}
        addHref={(page) => `${PATHS.WORKSHEET}${page}/0/`}
        addTestId="add-worksheet"
        tableClassName="worksheet-table"
    />
);

export default Worksheets;
