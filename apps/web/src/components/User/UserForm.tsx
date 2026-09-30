import type { EntityOnChangeIF, MutateIF, SelectOptionIF } from '../../types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { debounceTimer, endpoint, PATHS, RESOURCE } from '../../variables';
import { Formify, handleError } from '../../shared/helpers';
import { useDebounce } from '../../hooks/useDebounce';
import Field from '../_shared/Form/Field';
import { useNavigate, useParams } from 'react-router-dom';
import type { AxiosResponse } from 'axios';
import { Axios } from '../../Axios';
import { useNotificationHandler } from '../../hooks/useNotificationHandler';
import type { UserFormIF, UserIF } from '../../types/user';
import type { InputFieldsIF } from '../../types/form';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useAuth } from '../../contexts/Auth';
import style from './UserForm.module.sass';

export const UserForm = forwardRef(({ initialUser, isNew, type }: UserFormIF, ref) => {
    const page = Number(useParams().page) || 1;
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [draft, setDraft] = useState<UserIF>(() => {
        if (isNew || !initialUser) {
            return {} as UserIF;
        }
        return initialUser;
    });
    const { user, setUser } = useAuth();

    useEffect(() => {
        if (!isNew) {
            setDraft((prev) => ({
                ...prev,
                avatar: initialUser?.avatar ?? '',
            }));
        }
    }, [initialUser?.avatar, isNew]);

    const notification = useNotificationHandler();
    const { t } = useSafeTranslation();

    const roleOptions: SelectOptionIF[] = [
        {
            label: t('users.form.user'),
            value: 'user',
        },
        {
            label: t('users.form.admin'),
            value: 'admin',
        },
    ];
    const generaltTypes = ['1', '0'];
    const currentRole = roleOptions.find((opt) => opt.value === initialUser?.role);

    const inputFields: InputFieldsIF[] = [
        { name: 'username' },
        { name: 'name' },
        {
            name: 'discount',
            type: 'toggle',
            toggle: {
                items: generaltTypes,
                initial: String(initialUser?.discount),
                onChange: (value) => onChange({ name: 'discount', value }),
            },
        },
        {
            name: 'offer',
            type: 'toggle',
            toggle: {
                items: generaltTypes,
                initial: String(initialUser?.offer),
                onChange: (value) => onChange({ name: 'offer', value }),
            },
        },
        {
            name: 'role',
            type: 'select',
            select: {
                initial: currentRole,
                options: roleOptions,
            },
        },
        {
            name: 'avatar',
            type: 'image',
            resource: RESOURCE.USER_AVATAR,
            callbackParam: initialUser?.id,
            invalidators: [
                [type, String(draft.id)],
                [`${type}s`],
                [RESOURCE.USER, String(draft.id)],
                ...(draft.id === user?.id ? [[RESOURCE.PROFILE]] : []),
            ],
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

        if (draft.id === user?.id) {
            await queryClient.invalidateQueries({ queryKey: [RESOURCE.PROFILE] });

            const newAvatar =
                draft.avatar && (draft.avatar as unknown as File).name
                    ? draft.avatar
                    : user?.avatar;

            if (newAvatar) {
                setUser({
                    ...user,
                    avatar: String(newAvatar),
                });
            }
        }
    };

    const { mutate: doSave } = useMutation<AxiosResponse, Error, MutateIF<UserIF>>({
        mutationFn: ({ data }) => {
            const path = `${endpoint}${PATHS.USER}${!isNew ? `${data.id}/` : ''}`;
            const formifiedData = Formify(data);

            return isNew ? Axios.post(path, formifiedData) : Axios.put(path, formifiedData);
        },
        onSuccess: async (response, variables) => {
            const { insertId, success, message } = response.data;

            await notification({ success, message, invalidator, show: variables.show });

            if (success && isNew) {
                navigate(`${PATHS.USER}${page}/${insertId}/`);
            }
        },
        onError: (err: Error) => handleError(err.message),
    });

    const debouncedAutoSave = useDebounce<[UserIF]>((data) => {
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
                    className={`general-form ${style.userDetails}`}
                >
                    {inputFields.map((props, index) => {
                        const { name } = props;

                        return (
                            <Field
                                key={index}
                                parent="users"
                                {...props}
                                value={draft[name as keyof UserIF] as string}
                                onChange={onChange}
                            />
                        );
                    })}

                    <input type="submit" className="hidden" />
                </form>
            </section>
        </div>
    );
});

UserForm.displayName = 'UserForm';
