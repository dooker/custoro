import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import Header from '../Header/Header';
import ListFrame from './ListFrame';
import ListTable from './ListTable';
import { pageAfterDelete, pageFromParam, resolveColumns, type Columns } from './listLogic';
import DeleteButton from './DeleteButton';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { useListParams } from '../../../hooks/useListParams';
import { type ListParams, useResourceList } from '../../../hooks/useResourceList';
import { useDeleteItem } from '../../../hooks/useDeleteItem';
import type { HeaderButtonIF } from '../../../types/header';

interface ListPageIF<T extends { id: number }> {
    // The resource: the section's class, the cache key and the delete
    resource: string;
    // The list's address, the same for the page and the API: /customers/ (pages at /customers/2/)
    path: string;
    // A text key
    title: string;
    columns: Columns<T>;
    rowHref: (row: T, page: number) => string | undefined;
    // The "Add" button's address, when the list has one
    addHref?: (page: number) => string;
    addTestId?: string;
    buttons?: HeaderButtonIF[];
    // A delete button in every row
    deletable?: boolean;
    // A row leads to a record of this list and carries its search and page size, so the record's
    // Go back returns to the same rows (useListReturn). Off for rows that lead to another list.
    rowsKeepParams?: boolean;
    params?: ListParams;
    rowClassName?: (row: T) => string;
    tableClassName?: string;
    // Above the table, such as an explanation
    intro?: ReactNode;
}

/**
 * A full-page list: its header (title, search, Add), the rows of the page in the URL, the search
 * in the URL, pages, and delete. A page of the app only says what is different: its columns and
 * where a row leads.
 */
const ListPage = <T extends { id: number }>({
    resource,
    path,
    title,
    columns,
    rowHref,
    addHref,
    addTestId,
    buttons = [],
    deletable,
    rowsKeepParams = true,
    params,
    rowClassName,
    tableClassName,
    intro,
}: ListPageIF<T>) => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const page = pageFromParam(useParams().page);
    const pageHref = (number: number) => `${path}${number}/`;
    const { keyword, size, setKeyword, setSize, withParams } = useListParams(pageHref);
    const { promptDelete } = useDeleteItem([resource]);
    const query = useResourceList<T>(
        {
            resource,
            path,
            page,
            limit: size,
            keyword,
            params,
        },
        { prefetchNext: true }
    );

    const headerButtons: HeaderButtonIF[] = [
        ...(addHref
            ? [
                  {
                      label: 'button.add',
                      onClick: () => navigate(withParams(addHref(page))),
                      ...(addTestId ? { dataTestId: addTestId } : {}),
                  },
              ]
            : []),
        ...buttons,
    ];

    // Deleting the last row of a page goes to the page before, which still has rows
    const remove = (row: T, rowsOnPage: number) => {
        const target = pageAfterDelete(page, rowsOnPage);

        promptDelete({
            id: row.id,
            resource,
            page: target,
            returnTo: withParams(pageHref(target)),
        });
    };

    return (
        <>
            <Header
                title={t(title)}
                search={{ value: keyword, onChange: setKeyword }}
                buttons={headerButtons}
            />

            <ListFrame
                resource={resource}
                query={query}
                page={page}
                pageHref={(number) => withParams(pageHref(number))}
                pageSize={{ value: size, onChange: setSize }}
                heading={intro}
            >
                {(rows) => (
                    <ListTable<T>
                        columns={resolveColumns(columns, rows)}
                        rows={rows}
                        rowKey={(row) => row.id}
                        rowHref={(row) => {
                            const href = rowHref(row, page);

                            return href && rowsKeepParams ? withParams(href) : href;
                        }}
                        rowClassName={rowClassName}
                        className={tableClassName}
                        {...(deletable
                            ? {
                                  actions: (row: T) => (
                                      <DeleteButton onClick={() => remove(row, rows.length)} />
                                  ),
                              }
                            : {})}
                    />
                )}
            </ListFrame>
        </>
    );
};

export default ListPage;
