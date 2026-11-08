import Button from '../_shared/Form/Button';
import { t } from 'i18next';
import { endpoint } from '../../variables';
import { formatDateTime, handleError } from '../../shared/helpers';
import { PdfButton } from './PdfButton';
import type { InvoiceIF } from '../../types';
import { useMutation } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import { Axios } from '../../Axios';
import { useNotificationHandler } from '../../hooks/useNotificationHandler';
import styles from './Actions.module.sass';
import { useState } from 'react';

interface ActionsIF {
    markAsPaid: () => void;
    draft: InvoiceIF | null;
}

export const Actions = ({ markAsPaid, draft }: ActionsIF) => {
    const { customerId, locked } = draft || {};
    const isDisabled = !customerId;
    const isLocked = locked === 1;
    const notification = useNotificationHandler();
    const [pdfDropdownOpen, setPdfDropdownOpen] = useState(false);
    // When it was last emailed: from the invoice, then from the answer of each send
    const [sentDate, setSentDate] = useState(draft?.sentDate ?? null);

    const { mutate: sendEmail, isPending } = useMutation<AxiosResponse, Error>({
        mutationFn: () => Axios.post(`${endpoint}/email/`, { id: draft?.id }),
        onSuccess: async (response) => {
            const { success, message, sentDate: sentNow } = response.data;

            if (success && sentNow) {
                setSentDate(sentNow);
            }

            await notification({
                success,
                message: success ? 'invoiceSend' : message || 'invoiceSendFail',
                show: true,
            });
        },
        onError: (err: Error) => handleError(err.message),
    });

    if (!draft) {
        return null;
    }

    return (
        <header className={`${styles.actionsWrapper} ${pdfDropdownOpen ? styles.zBoost : ''}`}>
            <div className={styles.actions}>
                {draft.hash && (
                    <Button
                        additionalClassName="primary large"
                        disabled={isLocked}
                        text={t('button.paid')}
                        onClick={() => (isLocked ? null : markAsPaid())}
                    ></Button>
                )}

                <PdfButton isDisabled={isDisabled} draft={draft} onToggle={setPdfDropdownOpen} />

                {draft.hash && sentDate && (
                    <span className={styles.sent} data-testid="invoice-sent">
                        {t('invoices.sent')} {formatDateTime(sentDate)}
                    </span>
                )}

                {draft.hash && (
                    <Button
                        additionalClassName="primary large"
                        loading={isPending ? true : undefined}
                        text={t('button.send')}
                        onClick={() => sendEmail()}
                        disabled={isPending}
                    ></Button>
                )}
            </div>
        </header>
    );
};
