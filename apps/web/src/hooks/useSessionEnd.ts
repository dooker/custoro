import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/Auth';
import { useNotification } from '../store/notification';
import { PATHS, sessionEndedEvent } from '../variables';

// The API no longer accepts the login token (Axios.tsx sends the event): log out, go to the login
// page and say why. It has to live inside the router, because logging out alone does not leave
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

        window.addEventListener(sessionEndedEvent, onSessionEnded);

        return () => window.removeEventListener(sessionEndedEvent, onSessionEnded);
    }, [logout, navigate]);
};
