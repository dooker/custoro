import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type {
    DataResponseIF,
    EntityOnChangeIF,
    InvoiceIF,
    MutateIF,
    ProductIF,
    WorksheetIF,
} from '../../types';
import { useNavigate, useParams } from 'react-router-dom';
import { debounceTimer, endpoint, PATHS, RESOURCE } from '../../variables';
import { useDebounce } from '../../hooks/useDebounce';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { handleError } from '../../shared/helpers';
import { getMultiple } from '../../utils/Getters/getMultiple';
import Loader from '../_shared/Loader/Loader';
import Details from './Details';
import Items from './Items';
import { Actions } from './Actions';
import Total from './Total';
import type { AxiosResponse } from 'axios';
import { Axios } from '../../Axios';
import { useNotificationHandler } from '../../hooks/useNotificationHandler';
import { useConfirmationHandler } from '../../hooks/useConfirmationHandler';
import type { CustomerIF } from '../../types/customer';
import styles from './InvoiceForm.module.sass';

import type { FormHandleIF } from '../../types/form';

interface InvoiceFormIF {
    ref?: Ref<FormHandleIF>;
    initialInvoice: InvoiceIF | null;
    isNew: boolean;
    type: string;
}

type TypedInvoiceIF = Partial<InvoiceIF> & {
    type?: string;
    add?: {
        invoiceId: number;
        customerId: number;
        items: {
            productId: number;
            quantity: number;
        }[];
    };
    delete?: number;
    update?: EntityOnChangeIF;
    paid?: boolean;
};

export const InvoiceForm = ({ initialInvoice, isNew, type, ref }: InvoiceFormIF) => {
    const page = Number(useParams().page) || 1;
    const [draft, setDraft] = useState<InvoiceIF>(() => {
        if (isNew || !initialInvoice) {
            return {} as InvoiceIF;
        }
        return initialInvoice;
    });
    const { items, locked, customerId } = draft;
    const isLocked = locked === 1;
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const draftRef = useRef<WorksheetIF>(draft);
    const addString = 'add';
    const updateString = 'update';
    const notification = useNotificationHandler();
    const confirmation = useConfirmationHandler();

    // fetch customers
    const { data: customers, isLoading } = useQuery<
        DataResponseIF<CustomerIF>,
        Error,
        CustomerIF[]
    >({
        queryKey: [RESOURCE.CUSTOMERS],
        queryFn: () => getMultiple<CustomerIF>({ path: PATHS.CUSTOMERS }),
        placeholderData: keepPreviousData,
        select: (data) => data?.resource || [],
        enabled: !isLocked,
    });
    const currentCustomerVatNumber = customers?.find(
        (customer) => Number(customer.id) === Number(customerId)
    )?.vatNumber;
    const noVat = currentCustomerVatNumber
        ? currentCustomerVatNumber?.substring(0, 2) !== 'EE'
        : false;

    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);

    const invalidator = async () => {
        await queryClient.invalidateQueries({ queryKey: [type, String(draftRef.current.id)] });
        await queryClient.invalidateQueries({ queryKey: [RESOURCE.INVOICES, page, undefined, ''] });
    };

    const { mutate: doSave } = useMutation<AxiosResponse, Error, MutateIF<TypedInvoiceIF>>({
        mutationFn: ({ data }) => {
            const { type, ...payload } = data;

            if (type === addString) {
                return Axios.put(`${endpoint}${PATHS.INVOICE}0/`, payload.add);
            } else if (type === updateString) {
                return Axios.put(
                    `${endpoint}${PATHS.INVOICE}${draft.id}/${payload.update?.name}/`,
                    payload.update
                );
            } else if (payload.paid) {
                return Axios.put(`${endpoint}${PATHS.INVOICE}paid/${draft.id}/`);
            } else {
                // general invoice save goes without ID, it is inside payload
                const path = `${endpoint}${PATHS.INVOICE}`;

                return isNew ? Axios.post(path, payload) : Axios.put(path, payload);
            }
        },
        onSuccess: async (response, variables) => {
            const { lastId, success, message } = response.data;

            await notification({ success, message, invalidator, show: variables.show });

            if (isNew) {
                navigate(`${PATHS.INVOICE}1/${lastId}/`);
            }
        },
        onError: (err: Error) => handleError(err.message),
    });

    useImperativeHandle(ref, () => ({
        submitSave() {
            doSave({ data: draft, show: true });
        },
    }));

    const markAsPaid = () => {
        // set locked in invoices - remove rows from worksheets where invoice ID matches
        confirmation({
            show: true,
            title: 'paid.title',
            text: 'paid.text',
            callback: () => updateDraft({ locked: 1 }),
            Icon: 'paid',
            showResource: false,
        });
    };

    const debouncedAutoSave = useDebounce<[TypedInvoiceIF]>((data) => {
        if (!isNew && (data.id || type)) {
            doSave({ data });
        }
    }, debounceTimer);

    const updateDraft = (patch: Partial<InvoiceIF>) => {
        const updated = {
            ...draft,
            ...patch,
        };

        setDraft(updated);

        debouncedAutoSave({
            ...updated,
            ...(Object.keys(patch)[0] === 'locked' ? { paid: true } : {}),
        });
    };

    // add new item to invoice
    const onItemAdd = (product: ProductIF) => {
        const params = {
            invoiceId: draft.id,
            customerId: draft.customerId,
            items: [
                {
                    productId: product.id,
                    quantity: 0,
                },
            ],
        };

        doSave({ data: { add: params, type: addString } });
    };

    if (isLoading) return <Loader />;

    return (
        <div>
            <Details
                draft={draft}
                onChange={({ name, value }) => updateDraft({ [name]: value } as Partial<InvoiceIF>)}
                customers={customers}
                noVat={noVat}
            />

            <table className={`${styles.invoiceItems} general-table`}>
                <Items
                    draft={initialInvoice}
                    onAdd={onItemAdd}
                    onChange={({ name, value }) =>
                        debouncedAutoSave({ update: { name, value }, type: updateString })
                    }
                />

                {items && <Total draft={initialInvoice} noVat={noVat} />}
            </table>

            <Actions markAsPaid={markAsPaid} draft={initialInvoice} />
        </div>
    );
};
