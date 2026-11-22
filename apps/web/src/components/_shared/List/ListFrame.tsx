import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import Pagination from '@mui/material/Pagination';
import PaginationItem from '@mui/material/PaginationItem';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { UseQueryResult } from '@tanstack/react-query';
import Loader from '../Loader/Loader';
import NoEntries from '../NoEntries/NoEntries';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import {
    pageCorrection,
    pageSizes,
    pagesOf,
    rangeOf,
    showPages,
    type ListDataIF,
} from './listLogic';
import '@css/shared/pagination.sass';
import styles from './List.module.sass';

interface ListFrameIF<T> {
    // The section's class, as before (component customers, ...): styles and tests use it
    resource: string;
    query: UseQueryResult<ListDataIF<T>>;
    page: number;
    // The address of a page of this list, with its search and page size (useListParams)
    pageHref?: (page: number) => string;
    // The rows-per-page choice, for a full-page list
    pageSize?: { value: number; onChange: (size: number) => void };
    heading?: ReactNode;
    children: (rows: T[]) => ReactNode;
}

/**
 * A list's states in one place: loading, could not load, no entries, the rows, and under them
 * "16–30 of 212", the page size and the page numbers (links, so a page opens in a new tab too).
 */
const ListFrame = <T,>({
    resource,
    query,
    page,
    pageHref,
    pageSize,
    heading,
    children,
}: ListFrameIF<T>) => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const narrow = useMediaQuery('(max-width: 600px)');
    const { data, isLoading, isError, isFetching, isPlaceholderData } = query;
    const rows = data?.resource ?? [];
    const pages = pagesOf(data?.meta);
    const range = rangeOf(data?.meta, rows.length);
    // A page past the end: the API answered with the last page, and the address follows it
    const correction = pageHref && !isPlaceholderData ? pageCorrection(page, data?.meta) : null;
    const shownPageRef = useRef(page);

    useEffect(() => {
        if (correction && pageHref) {
            navigate(pageHref(correction), { replace: true });
        }
    }, [correction, pageHref, navigate]);

    // Another page starts at the top of the list, not at the page numbers under the last row
    useEffect(() => {
        if (shownPageRef.current !== page) {
            shownPageRef.current = page;
            window.scrollTo({ top: 0 });
        }
    }, [page]);

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

    const footer = pageHref && !isError && (range || showPages(pages));

    return (
        <section
            className={`component ${resource}${isFetching && !isLoading ? ` ${styles.fetching}` : ''}`}
            aria-busy={isFetching}
        >
            {heading}

            {body()}

            {footer && (
                <div className={styles.footer}>
                    <div className={styles.summary}>
                        {range && <span data-testid="list-range">{t('listRange', range)}</span>}

                        {pageSize && (
                            <label className={styles.size}>
                                {t('listPageSize')}
                                <select
                                    value={pageSize.value}
                                    onChange={(event) =>
                                        pageSize.onChange(Number(event.target.value))
                                    }
                                    data-testid="page-size"
                                >
                                    {pageSizes.map((size) => (
                                        <option key={size} value={size}>
                                            {size}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>

                    {showPages(pages) && (
                        <Pagination
                            count={pages}
                            page={page}
                            color="primary"
                            showFirstButton
                            showLastButton
                            siblingCount={narrow ? 0 : 1}
                            renderItem={(item) =>
                                item.page && !item.disabled && !item.type.endsWith('ellipsis') ? (
                                    <PaginationItem
                                        {...item}
                                        component={Link}
                                        to={pageHref(item.page)}
                                    />
                                ) : (
                                    <PaginationItem {...item} />
                                )
                            }
                        />
                    )}
                </div>
            )}
        </section>
    );
};

export default ListFrame;
