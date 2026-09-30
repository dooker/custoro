import { endpoint } from '../../variables';
import { handleError } from '../../shared/helpers';
import type { DataResponseIF } from '../../types';
import { Axios } from '../../Axios';

interface GetSearchIF {
    keyword: string;
    resource: string;
    page: string | number;
    customer?: string;
    limit?: number;
}

export const getSearch = async <T>({
    keyword = '',
    resource = '',
    page = 0,
    customer = '',
    limit,
}: GetSearchIF): Promise<DataResponseIF<T>> => {
    if (!resource) {
        handleError('Resource type missing for data fetching');

        return Promise.resolve({ resource: [] as T[] });
    }

    return Axios.get<DataResponseIF<T>>(`${endpoint}/search/`, {
        params: {
            limit,
            resource,
            keyword: encodeURIComponent(keyword),
            page,
            ...(customer ? { customer } : {}),
        },
    })
        .then(({ data }) => data)
        .catch((error) => {
            handleError(error);

            return { resource: [] };
        });
};
