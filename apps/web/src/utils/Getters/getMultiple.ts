import { endpoint, PATHS } from '../../variables';
import { handleError } from '../../shared/helpers';
import type { DataResponseIF, GetterIF } from '../../types';
import { Axios } from '../../Axios';

export const getMultiple = async <T>({
    path = '',
    page = 0,
    id = null,
    customerId = 0,
    limit,
    compact,
}: GetterIF): Promise<DataResponseIF<T>> => {
    if (!endpoint || !path) {
        handleError('Resource details are missing for data fetching');

        return Promise.resolve({ resource: [] as T[] });
    }

    const canUseCompact = !([PATHS.WORKSHEETS, PATHS.INVOICES] as string[]).includes(path);

    return Axios.get<DataResponseIF<T>>(`${endpoint}${path}`, {
        params: {
            limit,
            ...(id ? { customer: id } : {}),
            ...(page ? { page } : {}),
            ...(path === PATHS.WORKSHEETS && customerId ? { customer: customerId } : {}),
            ...(compact && canUseCompact ? { order: 'id', direction: 'DESC' } : {}),
        },
    })
        .then(({ data }) => data)
        .catch((error) => {
            handleError(error);

            return { resource: [] };
        });
};
