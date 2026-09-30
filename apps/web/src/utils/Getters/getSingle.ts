import { handleError } from '../../shared/helpers';
import type { SingleGetterIF } from '../../types';
import { endpoint, PATHS, RESOURCE } from '../../variables';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '../../types/api';
import { Axios } from '../../Axios';

export const getSingle = async <T>({
    id,
    type,
    config,
}: Partial<SingleGetterIF> = {}): Promise<T | null> => {
    if (!id || !type) {
        return null;
    }

    const mapper = {
        [RESOURCE.CUSTOMER]: PATHS.CUSTOMER,
        [RESOURCE.PRODUCT]: PATHS.PRODUCT,
        [RESOURCE.INVOICE]: PATHS.INVOICE,
        [RESOURCE.WORKSHEET]: PATHS.WORKSHEET,
        [RESOURCE.PDF]: PATHS.PDF,
        [RESOURCE.USER]: PATHS.USER,
    };
    const path = mapper[type as keyof typeof mapper];

    if (!path) {
        handleError('No request path set');

        return null;
    }

    try {
        if (type === RESOURCE.PDF) {
            const response = await Axios.get(`${endpoint}${path}${id}/`, {
                ...config,
                responseType: 'arraybuffer',
            });

            return response as unknown as T;
        }

        const {
            data: { success, data },
        } = await Axios.get(`${endpoint}${path}${id}/`, config);

        const result = data[0];

        if (!success || !result) {
            return null;
        }

        return result || null;
    } catch (error) {
        const axiosError = error as AxiosError<ApiErrorResponse>;
        const msg = axiosError.response?.data?.message || axiosError.message || 'general error';

        handleError(msg);

        return null;
    }
};
