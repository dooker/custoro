import { useNavigate, useSearchParams } from 'react-router';
import {
    searchParam,
    searchTarget,
    withSearch as hrefWithSearch,
} from '../components/_shared/List/listLogic';

export { searchParam };

/**
 * A list's search word lives in the URL (?q=), so it survives back and forward and a link shows
 * the same list. A new search starts on page 1 (searchTarget in listLogic.ts).
 */
export const useListSearch = (pageHref: (page: number) => string) => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const keyword = searchParams.get(searchParam) ?? '';

    const setKeyword = (next: string) => {
        const target = searchTarget(next, keyword, pageHref(1));

        if (target) {
            navigate(target, { replace: true });
        }
    };

    return {
        keyword,
        setKeyword,
        withSearch: (href: string) => hrefWithSearch(href, keyword),
    };
};
