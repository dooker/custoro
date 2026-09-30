import { useNotification } from '../store/notification';
import { handleError } from '../shared/helpers';
import type { NotificationStateIF } from '../types/store';

export const useNotificationHandler = () => {
    const updateShow = useNotification((state) => state.updateShow);
    const updateMessage = useNotification((state) => state.updateMessage);
    const updateError = useNotification((state) => state.updateError);

    return async ({ success, message, invalidator, show }: NotificationStateIF) => {
        if (!success) {
            updateMessage(message || 'error');
            updateError(true);

            handleError(message || 'error');
        } else {
            updateMessage(message || 'saved');
            updateError(false);

            if (invalidator) {
                await invalidator();
            }
        }

        if (show) {
            updateShow(true);
        }
    };
};
