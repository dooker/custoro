import Button from '../_shared/Form/Button';
import { t } from 'i18next';
import { useRef, useState } from 'react';
import { useOutsideAlerter } from '../../hooks/clickOutside';
import { endpoint, PATHS, RESOURCE } from '../../variables';
import { languageStorage } from '../_shared/Navigation/LanguageSelector';
import { handleError } from '../../shared/helpers';
import type { InvoiceIF } from '../../types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Axios } from '../../Axios';
import { useNotificationHandler } from '../../hooks/useNotificationHandler';
import styles from '@components/_shared/Form/Button.module.sass';

interface PdfButtonIF {
    draft: InvoiceIF;
    isDisabled: boolean;
    onToggle?: (open: boolean) => void;
}

export const PdfButton = ({ draft, isDisabled, onToggle }: PdfButtonIF) => {
    const [showPdfDropdown, setShowPdfDropdown] = useState(false);
    const showPdfDropdownRef = useRef(null);
    const queryClient = useQueryClient();
    const notification = useNotificationHandler();

    const toggleDropdown = () => {
        setShowPdfDropdown((prev) => {
            const next = !prev;
            onToggle?.(next);
            return next;
        });
    };

    useOutsideAlerter({
        ref: showPdfDropdownRef,
        callback: () => {
            setShowPdfDropdown(false);
            onToggle?.(false);
        },
    });

    const redirect = () => {
        if (!draft.hash) {
            return;
        }

        window.open(`${PATHS.PDF}${draft.hash}/`, 'CustoroInvoicePdf');
    };

    const generateRandomHashFromString = async (input: string) => {
        const salt = Math.random().toString(36).substring(2, 10);
        const inputWithSalt = input + salt;
        const encoder = new TextEncoder();
        const data = encoder.encode(inputWithSalt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');

        return hashHex.substring(0, 32);
    };

    const { mutate: generatePdf, isPending } = useMutation({
        mutationFn: async () => {
            const hash = await generateRandomHashFromString(`${draft.number}${draft.id}`);

            return Axios.put(`${endpoint}${PATHS.PDF}${draft.id}/`, {
                hash,
                language: localStorage.getItem(languageStorage),
            });
        },
        onSuccess: async ({ data: { success, message } }) => {
            await notification({
                success,
                message: success ? 'pdfGenerated' : message,
                show: true,
            });

            if (success) {
                await queryClient.invalidateQueries({
                    queryKey: [RESOURCE.INVOICE, String(draft.id)],
                });
            }
        },
        onError: (err: Error) => handleError(err.message),
    });

    if (!draft?.id) {
        return;
    }

    const text = draft.hash ? 'button.pdf' : 'button.generatePdf';
    const className = ['primary', 'large', ...(isPending ? ['loading'] : [])];

    return (
        <div className={styles.buttonContainer} ref={showPdfDropdownRef}>
            <Button
                additionalClassName={className.join(' ')}
                loading={isPending ? true : undefined}
                text={t(text)}
                onClick={() =>
                    isDisabled ? null : !isPending && draft.hash ? toggleDropdown() : generatePdf()
                }
                disabled={isDisabled}
            ></Button>

            {showPdfDropdown && (
                <div className={`${styles.buttonDropdown} ${styles.top}`}>
                    <ul>
                        {draft.hash && (
                            <li
                                onClick={() => {
                                    setShowPdfDropdown(false);
                                    redirect();
                                }}
                            >
                                {t('invoices.view')}
                            </li>
                        )}

                        <li
                            onClick={() => {
                                setShowPdfDropdown(false);
                                onToggle?.(false);
                                generatePdf();
                            }}
                        >
                            {t('invoices.regenerate')}
                        </li>
                    </ul>
                </div>
            )}
        </div>
    );
};
