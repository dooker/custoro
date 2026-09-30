import type { EntityOnChangeIF, MutateIF, SelectOptionIF } from '../../types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, forwardRef, lazy, Suspense, useImperativeHandle, useState } from 'react';
import { debounceTimer, endpoint, PATHS } from '../../variables';
import { handleError } from '../../shared/helpers';
import { useDebounce } from '../../hooks/useDebounce';
import Field from '../_shared/Form/Field';
import { useNavigate, useParams } from 'react-router-dom';
import type { AxiosResponse } from 'axios';
import { Axios } from '../../Axios';
import { useNotificationHandler } from '../../hooks/useNotificationHandler';
import type { CustomerFormIF, CustomerIF } from '../../types/customer';
import type { InputFieldsIF } from '../../types/form';
import styles from './CustomerForm.module.sass';

const WorksheetsPerCustomer = lazy(() => import('../Worksheets/WorksheetsPerCustomer'));
const Invoices = lazy(() => import('../Invoices/Invoices'));

export const CustomerForm = forwardRef(({ initialCustomer, isNew, type }: CustomerFormIF, ref) => {
    const page = Number(useParams().page) || 1;
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [draft, setDraft] = useState<CustomerIF>(() => {
        if (isNew || !initialCustomer) {
            return {} as CustomerIF;
        }
        return initialCustomer;
    });
    const notification = useNotificationHandler();

    const paymentPeriodOptions: SelectOptionIF[] = [
        {
            label: '7',
            value: '7',
        },
        {
            label: '14',
            value: '14',
        },
    ];
    const selectedPaymentPeriod = paymentPeriodOptions.filter(
        (item) => Number(item.value) === draft.paymentPeriod
    );
    const inputFields: InputFieldsIF[] = [
        { name: 'name' },
        { name: 'department' },
        { name: 'address' },
        { name: 'contact' },
        { name: 'phone' },
        { name: 'phone2' },
        { name: 'regNumber' },
        { name: 'vatNumber' },
        { name: 'www' },
        { name: 'email' },
        {
            name: 'additionalInfo',
            type: 'textarea',
        },
        {
            name: 'shippingInfo',
            type: 'textarea',
        },

        { name: 'invoiceEmail' },
        {
            name: 'paymentPeriod',
            type: 'select',
            select: {
                initial: selectedPaymentPeriod[0],
                options: paymentPeriodOptions,
            },
        },
    ];

    const handleSubmit = (e?: FormEvent) => {
        if (e) {
            e.preventDefault();
        }

        doSave({ data: draft, show: true });
    };

    const invalidator = async () => {
        await queryClient.invalidateQueries({ queryKey: [type, String(draft.id)] });
        await queryClient.invalidateQueries({ queryKey: [`${type}s`] });
    };

    const { mutate: doSave } = useMutation<AxiosResponse, Error, MutateIF<CustomerIF>>({
        mutationFn: ({ data }) => {
            const path = `${endpoint}${PATHS.CUSTOMER}${!isNew ? `${data.id}/` : ''}`;
            return isNew ? Axios.post(path, data) : Axios.put(path, data);
        },
        onSuccess: async (response, variables) => {
            const { insertId, success, message } = response.data;

            await notification({ success, message, invalidator, show: variables.show });

            if (isNew) {
                navigate(`${PATHS.CUSTOMER}${page}/${insertId}/`);
            }
        },
        onError: (err: Error) => handleError(err.message),
    });

    const debouncedAutoSave = useDebounce<[CustomerIF]>((data) => {
        if (!isNew && data.id) {
            doSave({ data });
        }
    }, debounceTimer);

    const onChange = ({ name, value }: EntityOnChangeIF) => {
        const updated = { ...draft, [name]: value };
        setDraft(updated);
        debouncedAutoSave(updated);
    };

    useImperativeHandle(ref, () => ({
        submitSave() {
            handleSubmit();
        },
    }));

    return (
        <div>
            <section className="component customer">
                <form
                    onSubmit={(e) => handleSubmit(e)}
                    className={`general-form ${styles.details}`}
                >
                    <>
                        {inputFields.map(({ name, type, select }, index) => (
                            <Field
                                key={index}
                                parent="customers"
                                name={name}
                                {...(type && { type: type })}
                                value={draft[name as keyof CustomerIF]}
                                onChange={onChange}
                                {...(select && { select })}
                            />
                        ))}
                    </>

                    <input type="submit" className="hidden" />
                </form>
            </section>

            <Suspense fallback={null}>
                {draft.id && (
                    <div className="splitter">
                        <WorksheetsPerCustomer compact existingCustomer={draft} />
                        <Invoices compact existingCustomer={draft} />
                    </div>
                )}
            </Suspense>
        </div>
    );
});

CustomerForm.displayName = 'CustomerForm';
