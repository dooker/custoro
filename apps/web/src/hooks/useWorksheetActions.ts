import { useState } from 'react';
import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { Axios } from '../Axios';
import { handleError } from '../shared/helpers';
import type { AxiosResponse } from 'axios';
import { endpoint, PATHS, RESOURCE } from '../variables';

interface InvoiceMutationIF {
    invoiceId?: number;
    customerId: number;
    items: {
        worksheetId: number;
        productId: number;
        quantity: number;
    }[];
}

export const useWorksheetActions = (customerId: number, queryKey: QueryKey) => {
    const [selectedCheckboxes, setSelectedCheckboxes] = useState<number[]>([]);
    const queryClient = useQueryClient();

    const { mutate: doInvoice, isPending } = useMutation<AxiosResponse, Error, InvoiceMutationIF>({
        mutationFn: (data) => {
            const url = `${endpoint}${PATHS.INVOICE}${data.invoiceId ? `${data.invoiceId}/` : ''}`;
            return data.invoiceId ? Axios.put(url, data) : Axios.post(url, data);
        },
        onSuccess: async () => {
            // Invalidate both worksheets and invoices
            await queryClient.invalidateQueries({ queryKey });
            await queryClient.invalidateQueries({
                queryKey: [RESOURCE.INVOICES, 'all', customerId],
            });
            await queryClient.invalidateQueries({ queryKey: [RESOURCE.INVOICES, 'last'] });
            setSelectedCheckboxes([]);
        },
        onError: (error) => handleError(error.message),
    });

    const toggleCheckbox = (id: number) => {
        setSelectedCheckboxes((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    return {
        selectedCheckboxes,
        setSelectedCheckboxes,
        doInvoice,
        isPending,
        toggleCheckbox,
    };
};
