import type { ComponentType } from 'react';
import { Link } from 'react-router';
import ListFrame from './ListFrame';
import ListTable from './ListTable';
import { resolveColumns, type Columns } from './listLogic';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { type ListParams, useResourceList } from '../../../hooks/useResourceList';
import { capitalizeFirst } from '../../../utils/_helpers';
import { widgetSize } from '../../../variables';
import styles from './List.module.sass';

interface ListWidgetIF<T extends { id: number }> {
    resource: string;
    path: string;
    // A text key, shown as "Latest <title>"
    title: string;
    columns: Columns<T>;
    rowHref: (row: T) => string | undefined;
    params?: ListParams;
    rowClassName?: (row: T) => string;
    // The cache key's first part, when it is not the resource
    queryResource?: string;
    // The whole list: the title links to it (Home)
    href?: string;
    // The list's icon from the menu, shown where the sidebar with the menu's icons is not (a phone)
    icon?: ComponentType;
}

/**
 * The first rows of a list inside another page (Home, a customer's page). It never touches the
 * page header: the page around it has its own title and buttons.
 */
const ListWidget = <T extends { id: number }>({
    resource,
    path,
    title: titleKey,
    columns,
    rowHref,
    params,
    rowClassName,
    queryResource = resource,
    href,
    icon: Icon,
}: ListWidgetIF<T>) => {
    const { t } = useSafeTranslation();
    const title = (
        <>
            {Icon && (
                <span className={styles.headingIcon} aria-hidden="true">
                    <Icon />
                </span>
            )}
            {t('latest')} {capitalizeFirst(t(titleKey))}
        </>
    );
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
                        {href ? (
                            <Link to={href} className={styles.headingLink}>
                                {title}
                            </Link>
                        ) : (
                            title
                        )}
                    </h2>
                </header>
            }
        >
            {(rows) => (
                <ListTable<T>
                    columns={resolveColumns(columns, rows)}
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
