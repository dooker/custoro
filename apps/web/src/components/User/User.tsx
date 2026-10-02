import { useEffect, useRef } from 'react';
import type { FormHandleIF } from '../../types/form';
import { UserForm } from './UserForm';
import { useNavigate, useParams } from 'react-router-dom';
import { getSingle } from '../../utils/Getters/getSingle';
import Loader from '../_shared/Loader/Loader';
import PageNotFound from '../PageNotFound/PageNotFound';
import { useQuery } from '@tanstack/react-query';
import '@css/shared/Form.sass';
import { PATHS, RESOURCE } from '../../variables';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import Header from '../_shared/Header/Header';
import { useDeleteItem } from '../../hooks/useDeleteItem';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { useButtonsHandler } from '../../hooks/useButtons';
import type { UserIF } from '../../types/user';

const User = () => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const { id: userId, page: rawPage } = useParams();
    const page = Number(rawPage || 1);
    const isNew = userId === '0';
    const formRef = useRef<FormHandleIF>(null);
    const { promptDelete } = useDeleteItem([RESOURCE.USERS]);
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();

    // fetch user
    const { data: user, isLoading } = useQuery<UserIF | null>({
        queryKey: [RESOURCE.USER, userId],
        queryFn: () => getSingle<UserIF>({ id: Number(userId), type: RESOURCE.USER }),
    });

    // Set up header config
    useEffect(() => {
        updateTitle({
            title: isNew
                ? `${t('new')} ${t('users.singular')}`
                : `${t('users.singular')}${user ? ` - ${user.name}` : ''}`,
        });
    }, [isNew, user, t, updateTitle]);

    useEffect(() => {
        const saveButton = {
            label: 'button.save',
            onClick: () => formRef.current && formRef.current.submitSave(),
        };
        const goBackButton = {
            label: 'button.goBack',
            onClick: () => navigate(`${PATHS.USERS}${page}`),
            classname: 'secondary',
        };
        const deleteButton = {
            label: 'button.delete',
            onClick: () =>
                user ? promptDelete({ id: user.id, resource: RESOURCE.USERS, page }) : null,
            classname: 'tertiary',
        };

        updateButtons({
            buttons: [saveButton, goBackButton, ...(user ? [deleteButton] : [])],
        });
    }, [updateButtons, navigate, page, promptDelete, user]);

    if (isLoading) return <Loader />;
    if (!isNew && !user) return <PageNotFound />;

    return (
        <>
            <Header />

            <UserForm
                ref={formRef}
                key={userId}
                initialUser={user ?? null}
                isNew={isNew}
                type={RESOURCE.USER}
            />
        </>
    );
};

export default User;
