import type { DataResponseIF } from '../../types';
import { useNavigate, useParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getMultiple } from '../../utils/Getters/getMultiple';
import DeleteIcon from '../../assets/images/x.svg?react';
import { useDeleteItem } from '../../hooks/useDeleteItem';
import { endpoint, PATHS, RESOURCE } from '../../variables';
import { useKeyword } from '../../hooks/useKeyword';
import { getSearch } from '../../utils/Getters/getSearch';
import DefaultList from '../_shared/DefaultList';
import NoEntries from '../_shared/NoEntries/NoEntries';
import Loader from '../_shared/Loader/Loader';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { visibleRowCount } from '../../shared/helpers';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { lazy, useEffect } from 'react';
import type { HeaderIF } from '../../types/header';
import { useButtonsHandler } from '../../hooks/useButtons';
import { useImage } from '../../hooks/useImage';
import { useAuth } from '../../contexts/Auth';
import type { UserAvatarIF, UserIF } from '../../types/user';
import type { ComponentIF } from '../../types/general';
import style from './Users.module.sass';

const PageNotFound = lazy(() => import('../PageNotFound/PageNotFound'));

const UserAvatar = ({ src, alt }: UserAvatarIF) => {
    const image = useImage({ src, alt });
    return <>{image}</>;
};

const Users = ({ compact }: ComponentIF) => {
    const page = Number(useParams().page) || 1;
    const navigate = useNavigate();
    const { t } = useSafeTranslation();
    const { keyword, updateKeyword } = useKeyword();
    const { promptDelete } = useDeleteItem([RESOURCE.USERS]);
    const limit = visibleRowCount(compact);
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();
    const { user } = useAuth();
    const { role } = user || {};

    // Set up header config
    useEffect(() => {
        updateTitle({ title: t('users.plural') });
    }, [t, updateTitle]);
    useEffect(() => {
        const searchButton = {
            label: 'button.search',
        };
        const addButton = {
            label: 'button.add',
            onClick: () => navigate(`${PATHS.USER}${page}/0/`),
            dataTestId: 'add-user',
        };

        updateButtons({ buttons: [searchButton, addButton] });
    }, [updateButtons, navigate, page]);
    const header: HeaderIF = {
        keyword: '',
        updateKeyword: updateKeyword,
    };

    // fetch users
    const { data, isLoading: loading } = useQuery<DataResponseIF<UserIF>>({
        queryKey: [RESOURCE.USERS, limit, page, compact, keyword],
        queryFn: () => {
            if (keyword) {
                return getSearch({ keyword, resource: RESOURCE.USERS, page, limit });
            }

            return getMultiple({ path: PATHS.USERS, page, compact, limit });
        },
        placeholderData: keepPreviousData,
    });
    const { resource: users, meta } = data || {};

    const usersTable = () => {
        if (!users) {
            return '';
        }

        const handleViewClick = (id: number) => {
            navigate(`${PATHS.USER}${page}/${id}/`);
        };

        return Object.values(users).map((user: UserIF, index) => {
            const { id, name, username, avatar, role } = user;

            return (
                <tr className="row" key={index}>
                    <td onClick={() => handleViewClick(id)} className="id">
                        {id}
                    </td>
                    <td onClick={() => handleViewClick(id)} className={style.avatar}>
                        <UserAvatar
                            src={avatar ? `${endpoint}/uploads/${avatar}` : null}
                            alt={name}
                        />
                    </td>
                    <td onClick={() => handleViewClick(id)} className="name">
                        {name}
                    </td>
                    <td onClick={() => handleViewClick(id)} className="username">
                        {username}
                    </td>
                    <td onClick={() => handleViewClick(id)} className="role">
                        {role}
                    </td>
                    {!compact && (
                        <td className="actions">
                            <DeleteIcon
                                onClick={() => promptDelete({ id, resource: RESOURCE.USERS, page })}
                            />
                        </td>
                    )}
                </tr>
            );
        });
    };

    const showList = () => {
        if (!users?.length) {
            return <NoEntries />;
        }

        return (
            <table className={`general-table users-table${compact ? ' compact' : ''}`}>
                <thead>
                    <tr>
                        <th className="id">#</th>
                        <th></th>
                        <th className="name">{t('users.form.name')}</th>
                        <th className="username">{t('users.form.username')}</th>
                        <th className="username">{t('users.form.role')}</th>
                        {!compact && <th className="actions" />}
                    </tr>
                </thead>
                <tbody>{usersTable()}</tbody>
            </table>
        );
    };

    if (role !== 'admin') {
        return <PageNotFound />;
    }
    if (loading) {
        return <Loader />;
    }

    return (
        <DefaultList
            list="users"
            loader={loading}
            renderer={showList}
            meta={meta}
            compact={compact}
            path={PATHS.USERS}
            header={header}
        />
    );
};

export default Users;
