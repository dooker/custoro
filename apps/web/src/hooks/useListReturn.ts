import { useSearchParams } from 'react-router';
import { searchParam, withListParams } from '../components/_shared/List/listLogic';
import { usePageParam } from './usePageParam';

/**
 * The way back from a record to the list it was opened from. A row's link carries the list's
 * search word (/product/2/7/?q=cable), so Go back, a delete and the page after creating a record
 * return to the same rows (/products/2/?q=cable), not to the unfiltered list, where page 2 means
 * other rows.
 */
export const useListReturn = (listPath: string, pageName: string = 'page') => {
    const page = usePageParam(pageName);
    const [searchParams] = useSearchParams();
    const params = { keyword: searchParams.get(searchParam) ?? '' };

    return {
        page,
        // The list, on the page the record was opened from, with its search
        listHref: withListParams(`${listPath}${page}/`, params),
        // Another address of the same visit (the record just created), the list's search kept
        keep: (href: string) => withListParams(href, params),
    };
};
