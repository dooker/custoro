import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import Header from '../Header/Header';
import ListFrame from './ListFrame';
import ListTable, { type ColumnIF } from './ListTable';
import DeleteButton from './DeleteButton';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { useListSearch } from '../../../hooks/useListSearch';
import { type ListParams, useResourceList } from '../../../hooks/useResourceList';
import { useDeleteItem } from '../../../hooks/useDeleteItem';
import type { HeaderButtonIF } from '../../../types/header';
import { listPageSize } from '../../../variables';

interface ListPageIF<T extends { id: number }> {
    // The resource: the section's class, the cache key, the /search resource and the delete
    resource: string;
    // The list's address, the same for the page and the API: /customers/ (pages at /customers/2/)
    path: string;
    // A text key
    title: string;
    columns: ColumnIF<T>[] | ((rows: T[]) => ColumnIF<T>[]);
    rowHref: (row: T, page: number) => string | undefined;
    // The "Add" button's address, when the list has one
    addHref?: (page: number) => string;
    addTestId?: string;
    buttons?: HeaderButtonIF[];
    // A delete button in every row
    deletable?: boolean;
    params?: ListParams;
    searchIn?: 'search' | 'list';
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
    params,
    searchIn,
    rowClassName,
    tableClassName,
    intro,
}: ListPageIF<T>) => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const page = Number(useParams().page) || 1;
    const pageHref = (number: number) => `${path}${number}/`;
    const { keyword, setKeyword, withSearch } = useListSearch(pageHref);
    const { promptDelete } = useDeleteItem([resource]);
    const query = useResourceList<T>({
        resource,
        path,
        page,
        limit: listPageSize,
        keyword,
        params,
        searchIn,
    });

    const headerButtons: HeaderButtonIF[] = [
        ...(addHref
            ? [
                  {
                      label: 'button.add',
                      onClick: () => navigate(addHref(page)),
                      ...(addTestId ? { dataTestId: addTestId } : {}),
                  },
              ]
            : []),
        ...buttons,
    ];

    // Deleting the last row of a page goes to the page before, which still has rows
    const remove = (row: T, rowsOnPage: number) => {
        const target = rowsOnPage === 1 && page > 1 ? page - 1 : page;

        promptDelete({
            id: row.id,
            resource,
            page: target,
            returnTo: withSearch(pageHref(target)),
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
                pageHref={(number) => withSearch(pageHref(number))}
                heading={intro}
            >
                {(rows) => (
                    <ListTable<T>
                        columns={typeof columns === 'function' ? columns(rows) : columns}
                        rows={rows}
                        rowKey={(row) => row.id}
                        rowHref={(row) => rowHref(row, page)}
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
