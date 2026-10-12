import { type ComponentType } from 'react';
import { Link } from 'react-router';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { useAuth } from '../../../contexts/Auth';
import styles from './Navigation.module.sass';

interface LinkIF {
    selector: string;
    link: string;
    Icon?: ComponentType | false;
    dataTestId?: string;
    level?: string;
}

export const NavItem = ({ selector, link, Icon, dataTestId, level }: LinkIF) => {
    const { t } = useSafeTranslation();
    const { user } = useAuth();
    const { role } = user || {};

    if (level === 'admin' && role !== 'admin') {
        return null;
    }

    const isActive = (link: string) => {
        return location.pathname.split('/')[1].includes(link.split('/')[1].slice(0, -1));
    };

    return (
        <li className={isActive(link) ? styles.active : ''}>
            <Link to={link} {...(dataTestId ? { 'data-testid': dataTestId } : {})}>
                {Icon && <Icon />}
                {t(`${selector}.plural`)}
            </Link>
        </li>
    );
};
