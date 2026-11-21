import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Axios } from '../Axios';
import {
    listAnswer,
    listQueryKey,
    listRequest,
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

export const useResourceList = <T>(options: ListRequestIF) =>
    useQuery<ListDataIF<T>>({
        queryKey: listQueryKey(options),
        queryFn: () => fetchResourceList<T>(options),
        // The page shown stays while the next one loads
        placeholderData: keepPreviousData,
        retry: 1,
    });
