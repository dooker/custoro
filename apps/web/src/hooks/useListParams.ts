import { useNavigate, useSearchParams } from 'react-router';
import {
    pageSizeFromParam,
    searchParam,
    searchTarget,
    sizeParam,
    sizeTarget,
    withListParams,
    type ListParamsIF,
} from '../components/_shared/List/listLogic';

/**
 * What a list keeps in its address besides the page: the search word (?q=) and the page size
 * (?size=30). Both survive paging, back and forward, reload and delete, and a link shows the same
 * list. A new word or size starts on page 1 (the rules are in listLogic.ts).
 */
export const useListParams = (pageHref: (page: number) => string) => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const current: ListParamsIF = {
        keyword: searchParams.get(searchParam) ?? '',
        size: pageSizeFromParam(searchParams.get(sizeParam)),
    };

    const go = (target: string | null, replace: boolean) => {
        if (target) {
            navigate(target, { replace });
        }
    };

    return {
        ...current,
        // Typing replaces the history entry (one per search, not one per letter)
        setKeyword: (next: string) => go(searchTarget(next, current, pageHref(1)), true),
        setSize: (next: number) => go(sizeTarget(next, current, pageHref(1)), false),
        withParams: (href: string) => withListParams(href, current),
    };
};
