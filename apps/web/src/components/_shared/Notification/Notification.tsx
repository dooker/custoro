import Snackbar from '@mui/material/Snackbar';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { useNotification } from '../../../store/notification';

const Notification = () => {
    const { t } = useSafeTranslation();

    const show = useNotification((state) => state.show);
    const message = useNotification((state) => state.message);
    const error = useNotification((state) => state.error);
    const updateShow = useNotification((state) => state.updateShow);

    return (
        <Snackbar
            open={show}
            autoHideDuration={2500}
            className={error ? 'snackbar-error' : ''}
            onClose={() => updateShow(false)}
            message={t(`notification.${message}`)}
        />
    );
};

export default Notification;
