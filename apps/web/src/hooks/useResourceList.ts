import { useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Axios } from '../Axios';
import {
    listAnswer,
    listQueryKey,
    listRequest,
    nextPage,
    pagesOf,
    type ListAnswerIF,
    type ListDataIF,
    type ListRequestIF,
} from '../components/_shared/List/listLogic';

export type { ListDataIF, ListParams } from '../components/_shared/List/listLogic';
export type ResourceListIF = ListRequestIF;
export { listQueryKey };

/** One page of a list (the rules are in listLogic.ts) */
export const fetchResourceList = async <T>(options: ListRequestIF): Promise<ListDataIF<T>> => {
    const { url, params } = listRequest(options);
    const { data } = await Axios.get<ListAnswerIF<T>>(url, { params });

    return listAnswer(data);
};

interface UseResourceListIF {
    // Load the next page ahead while this one is read, so a click on it shows at once
    prefetchNext?: boolean;
}

export const useResourceList = <T>(
    options: ListRequestIF,
    { prefetchNext = false }: UseResourceListIF = {}
) => {
    const queryClient = useQueryClient();
    const query = useQuery<ListDataIF<T>>({
        queryKey: listQueryKey(options),
        queryFn: () => fetchResourceList<T>(options),
        // The page shown stays while the next one loads
        placeholderData: keepPreviousData,
        retry: 1,
    });
    const pages = pagesOf(query.data?.meta);
    const ahead = prefetchNext && !query.isPlaceholderData ? nextPage(options.page, pages) : null;

    useEffect(() => {
        if (ahead) {
            const next = { ...options, page: ahead };

            // Fetches only when the next page is not in the cache yet (or is stale), so running
            // again on a render with the same options costs nothing
            void queryClient.prefetchQuery({
                queryKey: listQueryKey(next),
                queryFn: () => fetchResourceList<T>(next),
            });
        }
    }, [ahead, options, queryClient]);

    return query;
};
