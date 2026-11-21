import DeleteIcon from '../../../assets/images/x.svg?react';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import styles from './List.module.sass';

interface DeleteButtonIF {
    onClick: () => void;
    dataTestId?: string;
}

// The x at the end of a row: a real button, so it can be reached and named
const DeleteButton = ({ onClick, dataTestId }: DeleteButtonIF) => {
    const { t } = useSafeTranslation();

    return (
        <button
            type="button"
            className={styles.delete}
            aria-label={t('button.delete')}
            onClick={onClick}
            {...(dataTestId ? { 'data-testid': dataTestId } : {})}
        >
            <DeleteIcon aria-hidden="true" />
        </button>
    );
};

export default DeleteButton;
