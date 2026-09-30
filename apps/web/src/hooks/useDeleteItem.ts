import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Axios } from '../Axios';
import { useNavigate, useParams } from 'react-router-dom';
import { endpoint, PATHS, RESOURCE } from '../variables';
import type { AxiosResponse } from 'axios';
import { useNotificationHandler } from './useNotificationHandler';
import { useConfirmationHandler } from './useConfirmationHandler';
import type { PromptDeleteIF } from '../types/store';

export const useDeleteItem = (queryKeyToInvalidate: string[]) => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { invoiceId } = useParams();
    const notification = useNotificationHandler();
    const confirmation = useConfirmationHandler();

    const itemDeleteMutation = useMutation<AxiosResponse, Error, PromptDeleteIF>({
        mutationFn: async ({ id, resource }: PromptDeleteIF) => {
            const mapper = {
                [RESOURCE.CUSTOMERS]: PATHS.CUSTOMER,
                [RESOURCE.PRODUCTS]: PATHS.PRODUCT,
                [RESOURCE.WORKSHEETS]: PATHS.WORKSHEET,
                [RESOURCE.WORKSHEETS_PER_CUSTOMER]: PATHS.WORKSHEET,
                [RESOURCE.INVOICE]: PATHS.INVOICE,
                [RESOURCE.USERS]: PATHS.USER,
            };
            let path: string = mapper[resource as keyof typeof mapper];

            if (resource === RESOURCE.INVOICE) {
                path += `${invoiceId}/`;
            }

            if (!path) {
                await notification({
                    show: true,
                    success: false,
                });
            }

            return Axios.delete(`${endpoint}${path}${id}/`);
        },
        onSuccess: async (response, variables) => {
            const { success } = response.data;
            await queryClient.invalidateQueries({ queryKey: queryKeyToInvalidate });
            const { resource, page, customer, parentPage, cache } = variables;

            if (cache) {
                cache();
            }

            if (resource === RESOURCE.INVOICE) {
                navigate(`/${resource}/${page}/${invoiceId}/`);
            } else if (resource === RESOURCE.WORKSHEETS_PER_CUSTOMER) {
                navigate(`${PATHS.WORKSHEETS}${page}/${customer}/${parentPage}/`);
            } else {
                navigate(`/${resource}/${page}/`);
            }

            await notification({
                show: true,
                message: success ? 'deleted' : 'error',
                success,
            });
        },
    });

    const imageDeleteMutation = useMutation<AxiosResponse, Error, PromptDeleteIF>({
        mutationFn: (params: PromptDeleteIF) => {
            const { id, resource } = params;
            const resourceMapper = {
                [RESOURCE.PROFILE]: `${PATHS.PROFILE}${id}/`,
                [RESOURCE.SETTINGS]: PATHS.SETTINGS,
                [RESOURCE.USER_AVATAR]: PATHS.USER,
            };
            let url = `${endpoint}${resourceMapper[resource as keyof typeof resourceMapper]}`;

            if (params.resource.includes('.')) {
                const extension = params.resource.split('.').pop();

                url = `${url}${extension}/${id}/`;
            }

            return Axios.delete(url);
        },
        onSuccess: async (response, variables) => {
            const { success } = response.data;
            const { callback, invalidators } = variables;

            if (invalidators) {
                for (const queryKey of invalidators) {
                    await queryClient.invalidateQueries({ queryKey });
                }
            } else {
                await queryClient.invalidateQueries({ queryKey: [queryKeyToInvalidate] });
            }

            if (callback) {
                callback();
            }

            await notification({
                show: true,
                message: success ? 'deleted' : 'error',
                success,
            });
        },
    });

    const promptDelete = (params: PromptDeleteIF) => {
        const IMAGE_RESOURCES = [
            RESOURCE.PROFILE,
            RESOURCE.SETTINGS,
            RESOURCE.USER_AVATAR,
        ] as const;
        const { resource } = params;

        const isImageResource = (res: string): res is (typeof IMAGE_RESOURCES)[number] => {
            return (IMAGE_RESOURCES as readonly string[]).includes(res);
        };

        confirmation({
            show: true,
            title: 'delete.title',
            text: 'delete.text',
            params,
            callback: isImageResource(resource)
                ? (params) => imageDeleteMutation.mutate(params as PromptDeleteIF)
                : (params) => itemDeleteMutation.mutate(params as PromptDeleteIF),
            Icon: 'delete',
            showResource: true,
        });
    };

    // TODO isLoading is unused for now
    return {
        promptDelete,
        isLoading: itemDeleteMutation.isPending || imageDeleteMutation.isPending,
    };
};
