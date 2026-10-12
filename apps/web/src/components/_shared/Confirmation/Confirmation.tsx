import { type ReactElement, type Ref } from 'react';
import DeleteIcon from '@images/delete.svg?react';
import PaidIcon from '../../../assets/images/paid.svg?react';
import MaterialDialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Slide from '@mui/material/Slide';
import { TransitionProps } from '@mui/material/transitions';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import DOMPurify from 'dompurify';
import { useConfirmation } from '../../../store/confirmation';
import styles from './Confirmation.module.sass';

const Transition = ({
    children,
    ...props
}: TransitionProps & { children: ReactElement; ref?: Ref<unknown> }) => (
    <Slide direction="up" {...props}>
        {children}
    </Slide>
);

const Confirmation = () => {
    const show = useConfirmation((state) => state.show);
    const params = useConfirmation((state) => state.params);
    const title = useConfirmation((state) => state.title);
    const text = useConfirmation((state) => state.text);
    const Icon = useConfirmation((state) => state.Icon);
    const showResource = useConfirmation((state) => state.showResource);
    const callback = useConfirmation((state) => state.callback);
    const updateShow = useConfirmation((state) => state.updateShow);
    const iconMap = {
        delete: DeleteIcon,
        paid: PaidIcon,
    };
    const IconComponent = Icon ? iconMap[Icon] : DeleteIcon;
    const { t } = useSafeTranslation();
    const defaults = {
        title: 'delete.title',
        text: 'delete.text',
        yes: 'modal.yes',
        no: 'modal.no',
    };

    const handleConfirm = () => {
        updateShow(false);
        callback(params || undefined);
    };

    const handleCancel = () => {
        updateShow(false);
    };

    const handleKeyUp = (key: string) => {
        const allowedKeys = ['Enter', 'y', 'Y'];

        if (allowedKeys.includes(key)) {
            handleConfirm();
        } else {
            handleCancel();
        }
    };

    const translation = {
        title: title || defaults.title,
        text: text || defaults.text,
    };

    const cleanHtml = DOMPurify.sanitize(
        `${t(`modal.${translation.text}`)}${showResource && params ? `<span>${t(`${params.resource}.singular`)}</span>?` : ''}`
    );

    return (
        <MaterialDialog
            onClose={() => updateShow(false)}
            open={show}
            slots={{ transition: Transition }}
            onKeyUp={(event) => handleKeyUp(event.key)}
        >
            <DialogTitle>{t(`modal.${translation.title}`)}</DialogTitle>

            <DialogContent>
                <IconComponent />

                <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />
            </DialogContent>

            <DialogActions>
                <button
                    className={styles.confirm}
                    onClick={() => handleConfirm()}
                    data-testid="confirm-button"
                >
                    {t('modal.yes')}
                </button>
                <button
                    className={styles.cancel}
                    onClick={() => handleCancel()}
                    data-testid="cancel-button"
                >
                    {t('modal.no')}
                </button>
            </DialogActions>
        </MaterialDialog>
    );
};

export default Confirmation;
