import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import Pagination from '@mui/material/Pagination';
import PaginationItem from '@mui/material/PaginationItem';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { UseQueryResult } from '@tanstack/react-query';
import Loader from '../Loader/Loader';
import NoEntries from '../NoEntries/NoEntries';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import type { FitRowsIF } from '../../../hooks/useFitRows';
import { pageCorrection, pagesOf, rangeOf, showPages, type ListDataIF } from './listLogic';
import '@css/shared/pagination.sass';
import styles from './List.module.sass';

interface ListFrameIF<T> {
    // The section's class, as before (component customers, ...): styles and tests use it
    resource: string;
    query: UseQueryResult<ListDataIF<T>>;
    page: number;
    // The address of a page of this list, with its search (useListParams)
    pageHref?: (page: number) => string;
    // A full-page list shows as many rows as fit on the screen (useFitRows)
    fit?: Pick<FitRowsIF, 'ref' | 'measure' | 'show'>;
    heading?: ReactNode;
    children: (rows: T[]) => ReactNode;
}

/**
 * A list's states in one place: loading, could not load, no entries, the rows, and under them
 * "16–30 of 212" and the page numbers (links, so a page opens in a new tab too).
 */
const ListFrame = <T,>({
    resource,
    query,
    page,
    pageHref,
    fit,
    heading,
    children,
}: ListFrameIF<T>) => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const narrow = useMediaQuery('(max-width: 600px)');
    // Pending, not loading: a list waiting for its size (useFitRows) has not asked yet
    const { data, isPending, isError, isFetching, isPlaceholderData } = query;
    const rows = data?.resource ?? [];
    const pages = pagesOf(data?.meta);
    const range = rangeOf(data?.meta, rows.length);
    // A page past the end: the API answered with the last page, and the address follows it
    const correction = pageHref && !isPlaceholderData ? pageCorrection(page, data?.meta) : null;
    const shownPageRef = useRef(page);
    const hasRows = rows.length > 0;
    const measure = fit?.measure;
    const show = fit?.show;
    const shownMeta = data?.meta;
    const list = pageHref?.(1);

    // Which rows are on screen, for a resize to keep them. While the next page or a new search
    // loads, the rows shown are still the answer before (placeholder data): that answer stays, with
    // the list and search it was asked for.
    useLayoutEffect(() => {
        if (!isPlaceholderData) {
            show?.(shownMeta && { page: shownMeta.page, limit: shownMeta.limit, list });
        }
    }, [show, shownMeta, list, isPlaceholderData]);

    // Measured where the table will start, and again once the rows show their real heights
    useLayoutEffect(() => {
        measure?.();
    }, [measure, hasRows]);

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
        if (isPending) {
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
            ref={fit?.ref}
            className={`component ${resource}${isFetching && !isPending ? ` ${styles.fetching}` : ''}`}
            aria-busy={isFetching}
        >
            {heading}

            {body()}

            {footer && (
                <div className={styles.footer} data-list-footer>
                    <div>
                        {range && <span data-testid="list-range">{t('listRange', range)}</span>}
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
