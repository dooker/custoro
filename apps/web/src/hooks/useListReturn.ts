import { useSearchParams } from 'react-router';
import {
    pageSizeFromParam,
    searchParam,
    sizeParam,
    withListParams,
} from '../components/_shared/List/listLogic';
import { usePageParam } from './usePageParam';

/**
 * The way back from a record to the list it was opened from. A row's link carries the list's
 * search word and page size (/product/2/7/?q=cable&size=50), so Go back, a delete and the page
 * after creating a record return to the same rows (/products/2/?q=cable&size=50), not to an
 * unfiltered list of 15 rows a page, where page 2 means other rows.
 */
export const useListReturn = (listPath: string, pageName: string = 'page') => {
    const page = usePageParam(pageName);
    const [searchParams] = useSearchParams();
    const params = {
        keyword: searchParams.get(searchParam) ?? '',
        size: pageSizeFromParam(searchParams.get(sizeParam)),
    };

    return {
        page,
        // The list, on the page the record was opened from, with its search and size
        listHref: withListParams(`${listPath}${page}/`, params),
        // Another address of the same visit (the record just created), the list's search kept
        keep: (href: string) => withListParams(href, params),
    };
};
