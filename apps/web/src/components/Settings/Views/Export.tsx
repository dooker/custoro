import { useState } from 'react';
import Button from '../../_shared/Form/Button';
import { Axios } from '../../../Axios';
import { endpoint } from '../../../variables';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { useNotificationHandler } from '../../../hooks/useNotificationHandler';
import { previousMonth } from './exportPeriod';
import styles from './Export.module.sass';

// The invoices of a period as a CSV file for the accountant (GET /export/invoices, admin only):
// number, dates, customer, net, VAT and total as the PDFs print them, paid and emailed
const Export = () => {
    const { t, i18n } = useSafeTranslation();
    const notification = useNotificationHandler();
    const [period, setPeriod] = useState(previousMonth);
    const [loading, setLoading] = useState(false);

    const download = async () => {
        setLoading(true);

        try {
            const response = await Axios.get<Blob>(`${endpoint}/export/invoices`, {
                params: { ...period, language: i18n.language === 'et' ? 'et' : 'en' },
                responseType: 'blob',
            });
            const blob = response.data;

            // A refusal is the usual JSON answer, not a file
            if (blob.type.includes('application/json')) {
                const { success, message } = JSON.parse(await blob.text());

                await notification({ success, message, show: true });
                return;
            }

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            link.href = url;
            link.download = `invoices_${period.from}_${period.to}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            await notification({ success: false, message: 'error', show: true });
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className={`general-form ${styles.export}`}>
            <p>{t('settings.export.description')}</p>
            <div className={styles.period}>
                <label className="field">
                    <span>{t('settings.export.from')}</span>
                    <input
                        type="date"
                        name="from"
                        value={period.from}
                        onChange={(event) => setPeriod({ ...period, from: event.target.value })}
                    />
                </label>
                <label className="field">
                    <span>{t('settings.export.to')}</span>
                    <input
                        type="date"
                        name="to"
                        value={period.to}
                        onChange={(event) => setPeriod({ ...period, to: event.target.value })}
                    />
                </label>
                <Button
                    additionalClassName="primary large"
                    text={t('settings.export.download')}
                    loading={loading ? true : undefined}
                    disabled={loading || !period.from || !period.to}
                    onClick={() => void download()}
                    dataTestId="export-invoices"
                />
            </div>
        </section>
    );
};

export default Export;
