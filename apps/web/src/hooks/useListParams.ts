import { useNavigate, useSearchParams } from 'react-router';
import { searchParam, searchTarget, withListParams } from '../components/_shared/List/listLogic';

/**
 * What a list keeps in its address besides the page: the search word (?q=). It survives paging,
 * back and forward, reload and delete, and a link shows the same list. A new word starts on page
 * 1 (the rules are in listLogic.ts). The rows a page are not in the address: they follow the
 * screen (useFitRows).
 */
export const useListParams = (pageHref: (page: number) => string) => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const keyword = searchParams.get(searchParam) ?? '';

    return {
        keyword,
        // Typing replaces the history entry (one per search, not one per letter)
        setKeyword: (next: string) => {
            const target = searchTarget(next, keyword, pageHref(1));

            if (target) {
                navigate(target, { replace: true });
            }
        },
        withParams: (href: string) => withListParams(href, keyword),
    };
};
