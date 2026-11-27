import { useState } from 'react';
import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { Axios } from '../Axios';
import { handleError } from '../shared/helpers';
import type { AxiosResponse } from 'axios';
import { endpoint, PATHS, RESOURCE } from '../variables';
import { type InvoiceItemIF, toggled } from '../components/Worksheets/worksheetSelection';
import type { WorksheetIF } from '../types';

interface InvoiceMutationIF {
    invoiceId?: number;
    customerId: number;
    items: InvoiceItemIF[];
}

export const useWorksheetActions = (customerId: number, queryKey: QueryKey) => {
    // The picked worksheets with their product and quantity, also those no longer on screen
    const [picked, setPicked] = useState<InvoiceItemIF[]>([]);
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
            setPicked([]);
        },
        onError: (error) => handleError(error.message),
    });

    const toggleCheckbox = (row: WorksheetIF) => {
        setPicked((prev) => toggled(prev, row));
    };

    return {
        picked,
        setPicked,
        doInvoice,
        isPending,
        toggleCheckbox,
    };
};
