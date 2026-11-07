import { Link, useNavigate } from 'react-router';
import LanguageSelector from './LanguageSelector';
import { useAuth } from '../../../contexts/Auth';
import { useImage } from '../../../hooks/useImage';
import { NavItem } from './NavItem';
import Button from '../Form/Button';
import Product from '../Icons/Product';
import Customer from '../Icons/Customer';
import Worksheet from '../Icons/Worksheet';
import Invoice from '../Icons/Invoice';
import Home from '../Icons/Home';
import Settings from '../Icons/Settings';
import Users from '../Icons/Users';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { endpoint, PATHS, RESOURCE } from '../../../variables';
import { Axios } from '../../../Axios';
import { getLogoutUrl, revokeSession } from '../../../utils/auth';
import { useNotification } from '../../../store/notification';
import { versionLabel } from '../../../utils/buildInfo';
import styles from './Navigation.module.sass';

const menuItems = [
    { selector: RESOURCE.HOME, link: PATHS.HOME, Icon: Home },
    { selector: RESOURCE.PRODUCTS, link: `${PATHS.PRODUCTS}1/`, Icon: Product },
    { selector: RESOURCE.CUSTOMERS, link: `${PATHS.CUSTOMERS}1/`, Icon: Customer },
    { selector: RESOURCE.WORKSHEETS, link: `${PATHS.WORKSHEETS}1/`, Icon: Worksheet },
    { selector: RESOURCE.INVOICES, link: `${PATHS.INVOICES}1/`, Icon: Invoice },
    { selector: RESOURCE.USERS, link: `${PATHS.USERS}1/`, Icon: Users, level: 'admin' },
    { selector: RESOURCE.SETTINGS, link: `${PATHS.SETTINGS}`, Icon: Settings, level: 'admin' },
];

const Navigation = () => {
    const { t } = useSafeTranslation();
    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const { name, avatar } = user || {};

    // The API ends the session on every device first (the token is still needed for that). The
    // browser forgets the token either way; when the API refused or did not answer in time, the
    // login page says that the other sessions may still be valid.
    const handleLogout = async () => {
        const revoked = await revokeSession(() =>
            Axios.post(getLogoutUrl(endpoint), {}, { timeout: 5000 })
        );

        logout();
        navigate('/login', { replace: true });

        if (!revoked) {
            const notification = useNotification.getState();

            notification.updateMessage('logoutFailed');
            notification.updateError(true);
            notification.updateShow(true);
        }
    };

    return (
        <nav
            className={`grid bg-midnightBlue sticky top-0 h-full row-start-1 row-end-3 ${styles.sidebar}`}
        >
            <div className={styles.container}>
                <div>
                    <div className={styles.profile} onClick={() => navigate(PATHS.PROFILE)}>
                        <div className={styles.avatar}>
                            {useImage({
                                src: avatar && `${endpoint}/uploads/${avatar}`,
                                alt: name,
                            })}
                        </div>
                        {name}
                    </div>

                    <ul className={styles.menu}>
                        {menuItems.map((item) => {
                            return (
                                <NavItem
                                    dataTestId={`main-link-${item.selector}`}
                                    key={item.selector}
                                    {...item}
                                />
                            );
                        })}
                    </ul>
                </div>

                <div className={styles.footer}>
                    <div className={styles.actions}>
                        <Button
                            text={t('button.logout')}
                            additionalClassName="large secondary"
                            onClick={() => void handleLogout()}
                        />
                    </div>

                    <div className={styles.version}>
                        <LanguageSelector></LanguageSelector>

                        <span title={__APP_BUILT_AT__}>
                            {versionLabel(__APP_VERSION__, __APP_BUILD__)}
                        </span>

                        <Link to={PATHS.CHANGELOG}>{t('changelog')}</Link>
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default Navigation;
