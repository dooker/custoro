import ListFrame from './ListFrame';
import ListTable, { type ColumnIF } from './ListTable';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { type ListParams, useResourceList } from '../../../hooks/useResourceList';
import { capitalizeFirst } from '../../../utils/_helpers';
import { widgetSize } from '../../../variables';

interface ListWidgetIF<T extends { id: number }> {
    resource: string;
    path: string;
    // A text key, shown as "Latest <title>"
    title: string;
    columns: ColumnIF<T>[] | ((rows: T[]) => ColumnIF<T>[]);
    rowHref: (row: T) => string | undefined;
    params?: ListParams;
    rowClassName?: (row: T) => string;
    // The cache key's first part, when it is not the resource
    queryResource?: string;
}

/**
 * The first rows of a list inside another page (Home, a customer's page). It never touches the
 * page header: the page around it has its own title and buttons.
 */
const ListWidget = <T extends { id: number }>({
    resource,
    path,
    title,
    columns,
    rowHref,
    params,
    rowClassName,
    queryResource = resource,
}: ListWidgetIF<T>) => {
    const { t } = useSafeTranslation();
    const query = useResourceList<T>({
        resource: queryResource,
        path,
        page: 1,
        limit: widgetSize,
        params,
    });

    return (
        <ListFrame
            resource={resource}
            query={query}
            page={1}
            heading={
                <header>
                    <h2>
                        {t('latest')} {capitalizeFirst(t(title))}
                    </h2>
                </header>
            }
        >
            {(rows) => (
                <ListTable<T>
                    columns={typeof columns === 'function' ? columns(rows) : columns}
                    rows={rows}
                    rowKey={(row) => row.id}
                    rowHref={rowHref}
                    rowClassName={rowClassName}
                    compact
                />
            )}
        </ListFrame>
    );
};

export default ListWidget;
