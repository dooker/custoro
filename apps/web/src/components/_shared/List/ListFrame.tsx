import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import Pagination from '@mui/material/Pagination';
import type { UseQueryResult } from '@tanstack/react-query';
import Loader from '../Loader/Loader';
import NoEntries from '../NoEntries/NoEntries';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { showPages, type ListDataIF } from './listLogic';
import '@css/shared/pagination.sass';
import styles from './List.module.sass';

interface ListFrameIF<T> {
    // The section's class, as before (component customers, ...): styles and tests use it
    resource: string;
    query: UseQueryResult<ListDataIF<T>>;
    page: number;
    // The address of a page of this list; with the search kept (see useListSearch)
    pageHref?: (page: number) => string;
    heading?: ReactNode;
    children: (rows: T[]) => ReactNode;
}

/**
 * A list's states in one place: loading, could not load, no entries, the rows, and the pages
 * when there is more than one.
 */
const ListFrame = <T,>({ resource, query, page, pageHref, heading, children }: ListFrameIF<T>) => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const { data, isLoading, isError, isFetching } = query;
    const rows = data?.resource ?? [];
    const pages = data?.meta?.total ?? 0;

    const body = () => {
        if (isLoading) {
            return <Loader additionalClass="relative" />;
        }

        if (isError) {
            return (
                <div className={styles.error} role="alert">
                    {t('listError')}
                </div>
            );
        }

        if (!rows.length) {
            return <NoEntries />;
        }

        return children(rows);
    };

    return (
        <section
            className={`component ${resource}${isFetching && !isLoading ? ` ${styles.fetching}` : ''}`}
            aria-busy={isFetching}
        >
            {heading}

            {body()}

            {pageHref && showPages(pages) && (
                <Pagination
                    count={pages}
                    page={page}
                    color="primary"
                    onChange={(_event, value) => navigate(pageHref(value))}
                />
            )}
        </section>
    );
};

export default ListFrame;
