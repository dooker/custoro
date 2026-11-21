import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Axios } from '../Axios';
import { endpoint } from '../variables';
import type { DataResponseIF } from '../types';

export type ListParams = Record<string, string | number | undefined>;

export interface ResourceListIF {
    // The cache key's first part; invalidating [resource] reads every page of it again
    resource: string;
    // The list endpoint, such as /customers/
    path: string;
    page: number;
    limit: number;
    keyword?: string;
    // Extra query parameters, such as { customer: 4 } or { order: 'id', direction: 'DESC' }
    params?: ListParams;
    // Where a keyword goes: the shared /search endpoint (default) with this resource name, or the
    // list endpoint's own keyword parameter (GET /tenants)
    searchResource?: string;
    searchIn?: 'search' | 'list';
}

export interface ListDataIF<T> {
    resource: T[];
    meta?: { page?: number; total?: number };
}

interface ListAnswerIF<T> extends DataResponseIF<T> {
    success?: boolean;
    message?: string;
}

export const listQueryKey = ({ resource, page, limit, keyword = '', params }: ResourceListIF) => [
    resource,
    'list',
    { page, limit, keyword, ...params },
];

/**
 * One page of a list. A refusal or a failed request is an error, not an empty list, so the page
 * can say the list could not be loaded instead of "No entries".
 */
export const fetchResourceList = async <T>({
    resource,
    path,
    page,
    limit,
    keyword,
    params = {},
    searchResource = resource,
    searchIn = 'search',
}: ResourceListIF): Promise<ListDataIF<T>> => {
    const viaSearch = !!keyword && searchIn === 'search';
    // The API decodes the keyword once more (older callers sent it encoded)
    const encoded = keyword ? encodeURIComponent(keyword) : undefined;
    const { data } = await Axios.get<ListAnswerIF<T>>(
        viaSearch ? `${endpoint}/search/` : `${endpoint}${path}`,
        {
            params: viaSearch
                ? { resource: searchResource, keyword: encoded, page, limit, ...params }
                : { page, limit, ...params, ...(encoded ? { keyword: encoded } : {}) },
        }
    );

    if (data.success === false) {
        throw new Error(data.message || 'error');
    }

    return { resource: data.resource ?? [], meta: data.meta };
};

export const useResourceList = <T>(options: ResourceListIF) =>
    useQuery<ListDataIF<T>>({
        queryKey: listQueryKey(options),
        queryFn: () => fetchResourceList<T>(options),
        // The page shown stays while the next one loads
        placeholderData: keepPreviousData,
        retry: 1,
    });
