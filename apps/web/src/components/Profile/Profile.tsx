import { type FormEvent, useEffect, useState } from 'react';
import { endpoint, PATHS, RESOURCE } from '../../variables';
import { Axios } from '../../Axios';
import { handleError } from '../../shared/helpers';
import { type ProfileIF, useAuth } from '../../contexts/Auth';
import type { EntityOnChangeIF } from '../../types';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import '@css/shared/Form.sass';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Loader from '../_shared/Loader/Loader';
// import { getGeneral } from '../../utils/Getters/getGeneral';
import Field from '../_shared/Form/Field';
import Header from '../_shared/Header/Header';
import type { AxiosResponse } from 'axios';
import { useNotificationHandler } from '../../hooks/useNotificationHandler';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { useButtonsHandler } from '../../hooks/useButtons';

const Profile = () => {
    const { t } = useSafeTranslation();
    // TODO should be config for sure
    // const themes = [
    //     { label: 'Flat (default)', value: 'flat' },
    //     { label: 'Color', value: 'color' },
    // ];
    const { user, setUser } = useAuth();
    const [draft, setDraft] = useState<ProfileIF | null>(user);
    // const currentTheme = themes.filter((item) => item.value === draft?.theme)[0] || themes[0];
    const queryClient = useQueryClient();
    const notification = useNotificationHandler();
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();

    const invalidator = async () => {
        await queryClient.invalidateQueries({ queryKey: [RESOURCE.PROFILE] });
    };

    const { mutate: doSave } = useMutation<AxiosResponse, Error, ProfileIF>({
        mutationFn: (data: ProfileIF) =>
            // TODO use Formify
            Axios.put(`${endpoint}${PATHS.PROFILE}`, data, {
                headers: { 'Content-Type': 'multipart/form-data' },
            }),
        onSuccess: async (response, variables) => {
            const { success, message, filename } = response.data;

            await notification({ success, message, invalidator, show: true });

            if (success) {
                setUser({
                    ...user,
                    name: variables.name,
                    email: variables.email,
                    theme: variables.theme,
                    ...(filename ? { avatar: filename } : {}),
                });

                // if (localStorage.getItem(themeString) !== variables.theme) {
                //     localStorage.setItem(themeString, profile.theme);
                //     window.dispatchEvent(new Event(storageChange));
                // }
            }
        },
        onError: (err: Error) => handleError(err.message),
    });

    const onChange = ({ name, value }: EntityOnChangeIF) => {
        if (!draft) return;

        const updated: ProfileIF = {
            ...draft,
            [name]: value,
        };

        setDraft(updated);
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();

        if (!draft) return;

        doSave(draft);
    };

    // Set up header config
    useEffect(() => {
        updateTitle({ title: t('profile.singular') });
    }, [t, updateTitle]);
    useEffect(() => {
        const saveButton = {
            label: 'button.save',
            onClick: () => doSave(draft as ProfileIF),
        };
        updateButtons({ buttons: [saveButton] });
    }, [updateButtons, doSave, draft]);

    if (!draft) return <Loader />;

    return (
        <>
            <Header />

            <section className="component customer">
                <form className="general-form profile" onSubmit={(e) => handleSubmit(e)}>
                    <Field parent="profile" name="name" value={draft.name} onChange={onChange} />

                    <Field parent="profile" name="email" value={draft.email} onChange={onChange} />

                    <Field parent="profile" name="password" onChange={onChange} type="password" />

                    <Field
                        parent="profile"
                        name="avatar"
                        value={draft.avatar}
                        onChange={onChange}
                        type="image"
                        callback={() => onChange({ name: 'avatar', value: null })}
                        callbackParam={draft?.id || 0}
                        resource={RESOURCE.PROFILE}
                    />

                    {/*<Field*/}
                    {/*    parent="profile"*/}
                    {/*    name="theme"*/}
                    {/*    value={*/}
                    {/*        themes.filter((item) => item.value === draft.theme)[0] || currentTheme*/}
                    {/*    }*/}
                    {/*    onChange={onChange}*/}
                    {/*    type="select"*/}
                    {/*    options={themes}*/}
                    {/*/>*/}

                    <input type="submit" className="hidden" />
                </form>
            </section>
        </>
    );
};

export default Profile;
