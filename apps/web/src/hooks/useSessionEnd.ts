import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { tokenName, useAuth } from '../contexts/Auth';
import { sessionChangeInOtherTab } from '../utils/auth';
import { useNotification } from '../store/notification';
import { PATHS, sessionEndedEvent } from '../variables';

// The API no longer accepts the login token (Axios.tsx sends the event): log out, go to the login
// page and say why. When another tab logs out or in, this one reloads. It has to live inside the router, because logging out alone does not leave
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

        // Another tab logged out, or in (maybe as someone else): what this tab shows belongs to
        // the session before, so it starts again with whatever is stored now; without a token
        // that is the login page. It never removes the stored token itself: the other tab may
        // have logged in again before this event arrived, and that login would be lost.
        const onStorage = (event: StorageEvent) => {
            if (sessionChangeInOtherTab(event, tokenName)) {
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
