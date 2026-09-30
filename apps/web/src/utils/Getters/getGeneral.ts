import { handleError } from '../../shared/helpers';
import { endpoint, PATHS, RESOURCE } from '../../variables';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '../../types/api';
import { Axios } from '../../Axios';

interface GetGeneralIF {
    type: string;
    fields?: string;
    callback?: (message: string) => void;
}

export const getGeneral = async ({ type, fields, callback }: GetGeneralIF) => {
    try {
        const mapper = {
            [RESOURCE.SETTINGS]: PATHS.SETTINGS,
            [RESOURCE.PROFILE]: PATHS.PROFILE,
        };
        const path = mapper[type as keyof typeof mapper];
        const params = fields ? { fields } : {};

        const {
            data: { success, resource, data },
        } = await Axios.get(`${endpoint}${path}`, { params });

        if (!success) {
            handleError(`No success on getting settings`);

            return null;
        }

        return data ? data[0] : resource || [];
    } catch (error) {
        const axiosError = error as AxiosError<ApiErrorResponse>;
        const msg = axiosError.response?.data?.message || axiosError.message || 'general error';

        handleError(msg);

        if (callback) {
            callback(String(axiosError.code));
        }

        return null;
    }
};
