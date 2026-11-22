import { useRef } from 'react';
import type { FormHandleIF } from '../../types/form';
import { UserForm } from './UserForm';
import { useNavigate, useParams } from 'react-router';
import { getSingle } from '../../utils/Getters/getSingle';
import Loader from '../_shared/Loader/Loader';
import PageNotFound from '../PageNotFound/PageNotFound';
import { useQuery } from '@tanstack/react-query';
import '@css/shared/Form.sass';
import { PATHS, RESOURCE } from '../../variables';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import Header from '../_shared/Header/Header';
import { useDeleteItem } from '../../hooks/useDeleteItem';
import type { UserIF } from '../../types/user';
import { usePageParam } from '../../hooks/usePageParam';
import { useListReturn } from '../../hooks/useListReturn';

const User = () => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const { id: userId } = useParams();
    const page = usePageParam();
    // Back to the list it was opened from, with its search and page size
    const { listHref } = useListReturn(PATHS.USERS);
    const isNew = userId === '0';
    const formRef = useRef<FormHandleIF>(null);
    const { promptDelete } = useDeleteItem([RESOURCE.USERS]);

    // fetch user
    const { data: user, isLoading } = useQuery<UserIF | null>({
        queryKey: [RESOURCE.USER, userId],
        queryFn: () => getSingle<UserIF>({ id: Number(userId), type: RESOURCE.USER }),
    });

    const title = isNew
        ? `${t('new')} ${t('users.singular')}`
        : `${t('users.singular')}${user ? ` - ${user.name}` : ''}`;
    const buttons = [
        {
            label: 'button.save',
            onClick: () => formRef.current?.submitSave(),
        },
        {
            label: 'button.goBack',
            onClick: () => navigate(listHref),
            classname: 'secondary',
        },
        ...(user
            ? [
                  {
                      label: 'button.delete',
                      onClick: () =>
                          promptDelete({
                              id: user.id,
                              resource: RESOURCE.USERS,
                              page,
                              returnTo: listHref,
                          }),
                      classname: 'tertiary',
                  },
              ]
            : []),
    ];

    if (isLoading) return <Loader />;
    if (!isNew && !user) return <PageNotFound />;

    return (
        <>
            <Header title={title} buttons={buttons} />

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
