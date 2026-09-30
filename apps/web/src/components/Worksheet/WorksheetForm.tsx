import { type FormEvent, forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { endpoint, PATHS, RESOURCE } from '../../variables';
import type {
    ProductIF,
    SelectOptionIF,
    EntityOnChangeIF,
    WorksheetIF,
    MutateIF,
} from '../../types';
import Field from '../_shared/Form/Field';
import { useDebounce } from '../../hooks/useDebounce';
import { debounceTimer } from '../../variables';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { handleError } from '../../shared/helpers';
import { useNavigate, useParams } from 'react-router-dom';
import type { AxiosResponse } from 'axios';
import { Axios } from '../../Axios';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useNotificationHandler } from '../../hooks/useNotificationHandler';
import type { CustomerIF } from '../../types/customer';

interface WorksheetFormIF {
    initialWorksheet: WorksheetIF | null;
    customers: CustomerIF[];
    products: ProductIF[];
    isNew: boolean;
    customerId?: string;
}

export interface WorksheetErrorsIF {
    customer: string | null;
    product: string | null;
}

export const WorksheetForm = forwardRef(
    ({ initialWorksheet, customers, products, isNew }: WorksheetFormIF, ref) => {
        const navigate = useNavigate();
        const { t } = useSafeTranslation();
        const queryClient = useQueryClient();
        const page = Number(useParams().page) || 1;
        const { customerId, worksheetPage } = useParams();
        const currentWorksheetPage = Number(worksheetPage) || 1;
        const [errors, setErrors] = useState<WorksheetErrorsIF>({
            customer: null,
            product: null,
        });
        const notification = useNotificationHandler();

        const [draft, setDraft] = useState<WorksheetIF>(() => {
            if (isNew || !initialWorksheet) {
                return {} as WorksheetIF;
            }
            return initialWorksheet;
        });
        const draftRef = useRef<WorksheetIF>(draft);

        draftRef.current = draft;

        const customersOptions: SelectOptionIF[] = customers.map((item) => ({
            label: item.name || '',
            value: String(item.id),
        }));
        const selectedCustomer = customersOptions.find(
            (c) => Number(c.value) === Number(customerId)
        );

        const productsOptions: SelectOptionIF[] = products.map((item) => ({
            label: `${item.code} - ${item.name}` || '',
            value: String(item.id),
        }));
        const selectedProduct = productsOptions.find(
            (opt) => Number(opt.value) === draft.product_id
        );
        const url = `${page}/${Number(customerId) ? `${customerId}/` : ''}`;

        const validate = ({ data, show }: { data: WorksheetIF; show?: boolean }) => {
            setErrors({ customer: null, product: null });
            let hasError = false;
            let newData = data;

            if (isNew) {
                if (!Number(customerId) && !data.customer) {
                    setErrors((prev) => ({ ...prev, customer: 'customerRequired' }));
                    hasError = true;
                }

                if (!data.product_id) {
                    setErrors((prev) => ({ ...prev, product: 'productRequired' }));
                    hasError = true;
                }
            }

            if (isNew && Number(customerId)) {
                newData = {
                    ...newData,
                    customer: Number(customerId),
                };
            }

            if (!hasError) {
                doSave({ data: newData, show });
            }
        };

        const handleSubmit = (e?: FormEvent) => {
            if (e) {
                e.preventDefault();
            }

            validate({ data: draft, show: true });
        };

        const invalidator = async () => {
            await queryClient.invalidateQueries({
                predicate: (query) => {
                    const key = query.queryKey;

                    // we do not know "limit"
                    return (
                        key[0] === RESOURCE.WORKSHEETS_PER_CUSTOMER &&
                        key[2] === String(customerId) &&
                        key[3] === String(worksheetPage) &&
                        key[4] === String(currentWorksheetPage) &&
                        key[5] === ''
                    );
                },
            });
        };

        const { mutate: doSave } = useMutation<AxiosResponse, Error, MutateIF<WorksheetIF>>({
            mutationFn: ({ data }) => {
                const path = `${endpoint}${PATHS.WORKSHEET}${!isNew ? `${data.id}/` : ''}`;
                return isNew ? Axios.post(path, data) : Axios.put(path, data);
            },
            onSuccess: async (response, variables) => {
                const { success, message } = response.data;

                await notification({ success, message, invalidator, show: variables.show });

                if (isNew) {
                    if (worksheetPage) {
                        navigate(`${PATHS.WORKSHEETS}${url}${worksheetPage ? `1/` : ''}`);
                    } else {
                        navigate(
                            `${PATHS.WORKSHEETS}${page}/${variables.data.customer}/${currentWorksheetPage}/`
                        );
                    }
                }
            },
            onError: (err: Error) => handleError(err.message || 'test'),
        });

        const debouncedAutoSave = useDebounce<[WorksheetIF]>((data) => {
            if (!isNew && data.id) {
                validate({ data });
            }
        }, debounceTimer);

        const onChange = ({ name, value }: EntityOnChangeIF) => {
            const updated: WorksheetIF = {
                ...draft,
                [name]: value,
            };

            setDraft(updated);
            debouncedAutoSave(updated);
        };

        useImperativeHandle(ref, () => ({
            submitSave() {
                handleSubmit();
            },
        }));

        return (
            <section className="component customer">
                <form className="general-form product" onSubmit={(e) => handleSubmit(e)}>
                    {isNew && Number(customerId) === 0 && (
                        <Field
                            type="select"
                            parent={RESOURCE.WORKSHEETS}
                            name="customer"
                            onChange={onChange}
                            select={{ options: customersOptions, initial: selectedCustomer }}
                            placeholder={t('customers.form.placeholder')}
                            error={errors.customer}
                        />
                    )}

                    <Field
                        type="select"
                        parent={RESOURCE.WORKSHEETS}
                        name="product_id"
                        onChange={onChange}
                        select={{ options: productsOptions, initial: selectedProduct }}
                        placeholder={t('products.form.placeholder')}
                        error={errors.product}
                    />

                    <Field
                        type="number"
                        parent={RESOURCE.WORKSHEETS}
                        name="quantity"
                        value={String(draft.quantity || '')}
                        onChange={onChange}
                    />

                    <input type="submit" className="hidden" />
                </form>
            </section>
        );
    }
);

WorksheetForm.displayName = 'WorksheetForm';
