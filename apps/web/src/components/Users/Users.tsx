import ListPage from '../_shared/List/ListPage';
import { useImage } from '../../hooks/useImage';
import type { UserAvatarIF, UserIF } from '../../types/user';
import { endpoint, PATHS, RESOURCE } from '../../variables';
import style from './Users.module.sass';

const UserAvatar = ({ src, alt }: UserAvatarIF) => <>{useImage({ src, alt })}</>;

const Users = () => (
    <ListPage<UserIF>
        resource={RESOURCE.USERS}
        path={PATHS.USERS}
        title="users.plural"
        columns={[
            { key: 'id', label: '#', className: 'id' },
            {
                key: 'avatar',
                className: style.avatar,
                render: ({ avatar, name }) => (
                    <UserAvatar src={avatar ? `${endpoint}/uploads/${avatar}` : null} alt={name} />
                ),
            },
            { key: 'name', label: 'users.form.name', className: 'name' },
            { key: 'username', label: 'users.form.username', className: 'username' },
            { key: 'role', label: 'users.form.role', className: 'role' },
        ]}
        rowHref={({ id }, page) => `${PATHS.USER}${page}/${id}/`}
        addHref={(page) => `${PATHS.USER}${page}/0/`}
        addTestId="add-user"
        tableClassName="users-table"
        deletable
    />
);

export default Users;
