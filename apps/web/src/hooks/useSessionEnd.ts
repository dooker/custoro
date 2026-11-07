import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { tokenName, useAuth } from '../contexts/Auth';
import { sessionChangeInOtherTab } from '../utils/auth';
import { useNotification } from '../store/notification';
import { PATHS, sessionEndedEvent } from '../variables';

// The API no longer accepts the login token (Axios.tsx sends the event): log out, go to the login
// page and say why. The same when another tab of the app logs out. It has to live inside the router, because logging out alone does not leave
// the page the user is on, as in Navigation's own logout.
export const useSessionEnd = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const onSessionEnded = () => {
            logout();
            navigate(PATHS.LOGIN, { replace: true });

            const notification = useNotification.getState();

            notification.updateMessage('session_expired');
            notification.updateError(true);
            notification.updateShow(true);
        };

        // Another tab logged out: this one is logged out too and leaves its page. Another tab
        // logged in, maybe as someone else: what this tab shows belongs to the session before,
        // so it starts again with the new one.
        const onStorage = (event: StorageEvent) => {
            const change = sessionChangeInOtherTab(event, tokenName);

            if (change === 'loggedOut') {
                logout();
                navigate(PATHS.LOGIN, { replace: true });
            } else if (change === 'loggedIn') {
                window.location.reload();
            }
        };

        window.addEventListener(sessionEndedEvent, onSessionEnded);
        window.addEventListener('storage', onStorage);

        return () => {
            window.removeEventListener(sessionEndedEvent, onSessionEnded);
            window.removeEventListener('storage', onStorage);
        };
    }, [logout, navigate]);
};
