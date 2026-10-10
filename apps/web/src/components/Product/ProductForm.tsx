import type { EntityOnChangeIF, MutateIF, ProductIF, SelectOptionIF } from '../../types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, Fragment, useImperativeHandle, useState } from 'react';
import { debounceTimer, endpoint, PATHS } from '../../variables';
import { handleError } from '../../shared/helpers';
import { useDebounce } from '../../hooks/useDebounce';
import Field from '../_shared/Form/Field';
import { useNavigate, useParams } from 'react-router';
import HelpField from '../HelpField/Helpfield';
import type { AxiosResponse } from 'axios';
import { Axios } from '../../Axios';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useNotificationHandler } from '../../hooks/useNotificationHandler';
import type { FormRefIF } from '../../types/form';

interface ProductFormIF extends FormRefIF {
    initialProduct: ProductIF | null;
    isNew: boolean;
    type: string;
}

export const ProductForm = ({ initialProduct, isNew, type, ref }: ProductFormIF) => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { t } = useSafeTranslation();
    const page = Number(useParams().page) || 1;
    const [codeExists, setCodeExists] = useState(false);
    const notification = useNotificationHandler();
    // TODO these could be config one day?
    const units: SelectOptionIF[] = [
        { label: t('products.form.pc'), value: 'pc' },
        { label: t('products.form.set'), value: 'set' },
        { label: t('products.form.hour'), value: 'hour' },
        { label: 'm', value: 'm' },
        { label: 'km', value: 'km' },
    ];
    const fields = [
        {
            name: 'code',
            exists: true,
        },
        { name: 'name' },
        {
            name: 'price',
            help: true,
        },
        {
            name: 'discountPrice',
            discount: true,
        },
        {
            name: 'unit',
            type: 'select',
            select: {
                initial: initialProduct
                    ? units.find((u) => u.value === initialProduct.unit)
                    : units[0],
                options: units,
            },
        },
        { name: 'comment' },
    ];
    const emptyItem: ProductIF = {
        id: 0,
        code: '',
        name: '',
        price: 0,
        discountPrice: 0,
        unit: units[0].label,
        comment: '',
    };
    const [draft, setDraft] = useState<ProductIF>(() => {
        if (isNew || !initialProduct) {
            return emptyItem;
        }
        return initialProduct;
    });

    const { mutate: getCode } = useMutation<AxiosResponse, Error, ProductIF>({
        mutationFn: (data) =>
            Axios.get(`${endpoint}${PATHS.PRODUCT}`, { params: { code: data.code } }),
        onSuccess: (response, data) => {
            const exists = response.data.data !== 0;

            if (exists) {
                setCodeExists(true);

                return;
            }

            if (!isNew && data.id) {
                doSave({ data });
            }
        },
    });

    const invalidator = async () => {
        await queryClient.invalidateQueries({ queryKey: [type, String(draft.id)] });
        await queryClient.invalidateQueries({ queryKey: [`${type}s`] });
    };

    const { mutate: doSave } = useMutation<AxiosResponse, Error, MutateIF<ProductIF>>({
        mutationFn: ({ data }) => {
            const path = `${endpoint}${PATHS.PRODUCT}${!isNew ? `${data.id}/` : ''}`;
            return isNew ? Axios.post(path, data) : Axios.put(path, data);
        },
        onSuccess: async (response, variables) => {
            const { insertId, success, message } = response.data;

            await notification({ success, message, invalidator, show: variables.show });

            if (isNew && insertId) {
                navigate(`${PATHS.PRODUCT}${page}/${insertId}/`);
            }
        },
        onError: (err: Error) => handleError(err.message),
    });

    const debouncedAutoSave = useDebounce<[ProductIF, string]>((data, name) => {
        if (!isNew && data.id) {
            doSave({ data });
        } else {
            if (name === 'code') {
                setCodeExists(false);
                getCode(data);
            }
        }
    }, debounceTimer);

    const onChange = ({ name, value }: EntityOnChangeIF) => {
        let newValue: string | number | File | Date | null = value;

        if ((name === 'price' || name === 'discountPrice') && typeof value === 'string') {
            const normalizedValue = value.replace(',', '.');
            newValue = Number(normalizedValue);
        }

        const updated = { ...draft, [name]: newValue };
        setDraft(updated);
        debouncedAutoSave(updated, name);
    };

    const handleSubmit = (e?: FormEvent) => {
        if (e) {
            e.preventDefault();
        }

        doSave({ data: draft, show: true });
    };

    useImperativeHandle(ref, () => ({
        submitSave() {
            handleSubmit();
        },
    }));

    return (
        <form onSubmit={(e) => handleSubmit(e)} className="general-form product">
            {fields.map((field) => {
                const draftValue = draft[field.name as keyof ProductIF];
                const isSelect = field['type'] === 'select';
                const value = isSelect
                    ? (units.find((u) => u.value === draftValue) ?? units[0])
                    : draftValue;

                return (
                    <Fragment key={field.name}>
                        {field.help && <HelpField text="products.form.priceHelp" position="top" />}

                        <Field
                            {...field}
                            {...(isSelect ? { options: units } : {})}
                            parent="products"
                            value={value}
                            onChange={onChange}
                        />

                        {codeExists && field.name === 'code' && (
                            <HelpField
                                text={`products.form.${isNew ? 'duplicate' : 'duplicateSave'}`}
                                type="warning"
                            />
                        )}
                    </Fragment>
                );
            })}

            <input type="submit" className="hidden" />
        </form>
    );
};
