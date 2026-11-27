import { useEffect, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import useMediaQuery from '@mui/material/useMediaQuery';
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
import { endpoint, PATHS, RESOURCE, wideScreen } from '../../../variables';
import { Axios } from '../../../Axios';
import { getLogoutUrl, revokeSession } from '../../../utils/auth';
import { useNotification } from '../../../store/notification';
import { versionLabel } from '../../../utils/buildInfo';
import styles from './Navigation.module.sass';

// Settings is always the last item: a new menu item goes above it
export const menuItems = [
    { selector: RESOURCE.HOME, link: PATHS.HOME, Icon: Home },
    { selector: RESOURCE.PRODUCTS, link: `${PATHS.PRODUCTS}1/`, Icon: Product },
    { selector: RESOURCE.CUSTOMERS, link: `${PATHS.CUSTOMERS}1/`, Icon: Customer },
    { selector: RESOURCE.WORKSHEETS, link: `${PATHS.WORKSHEETS}1/`, Icon: Worksheet },
    { selector: RESOURCE.INVOICES, link: `${PATHS.INVOICES}1/`, Icon: Invoice },
    { selector: RESOURCE.USERS, link: `${PATHS.USERS}1/`, Icon: Users, level: 'admin' },
    { selector: RESOURCE.TENANTS, link: `${PATHS.TENANTS}1/`, Icon: Users, level: 'owner' },
    { selector: RESOURCE.SETTINGS, link: `${PATHS.SETTINGS}`, Icon: Settings, level: 'admin' },
];

const Navigation = () => {
    const { t } = useSafeTranslation();
    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const { name, avatar, companyName } = user || {};
    // A phone opens the menu over the whole screen; a wide screen always shows it as a sidebar
    // noSsr: the real answer on the first render, so a wide screen never starts as a phone
    const wide = useMediaQuery(wideScreen, { noSsr: true });
    const [open, setOpen] = useState(false);
    const drawerOpen = open && !wide;

    useEffect(() => {
        if (!drawerOpen) {
            return;
        }

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        // The page under the open menu stays where it was instead of scrolling with a swipe
        const { overflow } = document.body.style;

        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKey);

        return () => {
            document.body.style.overflow = overflow;
            document.removeEventListener('keydown', onKey);
        };
    }, [drawerOpen]);

    // A page opened from the menu (a link, the profile) closes it
    const closeOnLink = (event: MouseEvent<HTMLElement>) => {
        if ((event.target as Element).closest('a, [data-closes-menu]')) {
            setOpen(false);
        }
    };

    // The API ends the session on every device first (the token is still needed for that). The
    // browser forgets the token either way; unless the API confirmed it (it refused, did not answer
    // in time, or no longer took this token), the login page says the other sessions may still be
    // valid.
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
            className={`bg-midnightBlue h-full row-start-1 row-end-3 ${styles.sidebar} ${drawerOpen ? styles.open : ''}`}
            aria-label={t('menu.navigation')}
        >
            {/* Three lines that turn into an X: above the open menu, so it closes it too */}
            <button
                type="button"
                className={styles.toggle}
                aria-expanded={drawerOpen}
                aria-controls="main-menu"
                aria-label={t(drawerOpen ? 'menu.close' : 'menu.open')}
                data-testid="menu-toggle"
                onClick={() => setOpen(!open)}
            >
                <span />
                <span />
                <span />
            </button>

            <div
                id="main-menu"
                className={styles.container}
                // Closed on a phone: out of sight, and out of reach of Tab and screen readers
                inert={!wide && !open}
                onClick={closeOnLink}
            >
                <div>
                    <div
                        className={styles.profile}
                        data-closes-menu
                        onClick={() => navigate(PATHS.PROFILE)}
                    >
                        <div className={styles.avatar}>
                            {useImage({
                                src: avatar && `${endpoint}/uploads/${avatar}`,
                                alt: name,
                            })}
                        </div>
                        <div className={styles.who}>
                            {name}
                            {companyName && <small data-testid="company-name">{companyName}</small>}
                        </div>
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
