import { useNavigate, useSearchParams } from 'react-router';

export const searchParam = 'q';

/**
 * A list's search word lives in the URL (?q=), so it survives back and forward and a link shows
 * the same list. A new search starts on page 1: the matches of page 3 of the full list mean
 * nothing.
 */
export const useListSearch = (pageHref: (page: number) => string) => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const keyword = searchParams.get(searchParam) ?? '';

    const withSearch = (href: string) =>
        keyword ? `${href}?${searchParam}=${encodeURIComponent(keyword)}` : href;

    const setKeyword = (next: string) => {
        if (next === keyword) {
            return;
        }

        const href = pageHref(1);

        navigate(next ? `${href}?${searchParam}=${encodeURIComponent(next)}` : href, {
            replace: true,
        });
    };

    return { keyword, setKeyword, withSearch };
};
