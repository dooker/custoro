import type { InvoiceIF, InvoiceProductIF } from '../../types';
import { useAuth } from '../../contexts/Auth';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useQuery } from '@tanstack/react-query';
import { getGeneral } from '../../utils/Getters/getGeneral';
import { RESOURCE } from '../../variables';
import styles from './Total.module.sass';
import { getInvoiceVatRate } from '../../utils/invoiceVat';

interface TotalIF {
    draft: InvoiceIF | null;
    noVat: boolean;
}

const Total = ({ noVat, draft }: TotalIF) => {
    const { t } = useSafeTranslation();
    let total = 0;
    let discountTotal = 0;
    const { user } = useAuth();
    const { discount } = user || {};
    const { locked } = draft || {};
    const isLocked = locked === 1;

    // The rate stored on the invoice, as the PDF uses; the current setting only as a fallback
    const hasStoredVat = draft?.vat !== undefined && draft?.vat !== null;
    const { data: settings } = useQuery({
        queryKey: [RESOURCE.SETTINGS, 'vat'],
        queryFn: () => getGeneral({ type: RESOURCE.SETTINGS, fields: 'vat' }),
        enabled: !noVat && !hasStoredVat,
    });
    const vat = getInvoiceVatRate(draft?.vat, settings?.vat) / 100;

    draft?.items?.forEach(({ quantity, price, discountPrice }: InvoiceProductIF) => {
        total = total + (quantity || 0) * price;
        discountTotal = discountTotal + (quantity || 0) * discountPrice;
    });

    const vatPrice = noVat ? 0 : vat * total;
    const discountVatPrice = noVat ? 0 : vat * discountTotal;
    const spacer = discount ? 6 : 5;

    return (
        <tfoot className={styles.footer}>
            <tr className={styles.firstRow}>
                <td className="items" colSpan={spacer}>
                    {t('invoices.total')}
                </td>
                <td className="items">{Number(total).toFixed(2)}</td>
                {discount ? <td className="items">{Number(discountTotal).toFixed(2)}</td> : ''}
                {!isLocked && <td />}
            </tr>

            <tr>
                <td className="items" colSpan={spacer}>
                    {t('invoices.vat')}
                </td>
                <td className="items">{vatPrice.toFixed(2)}</td>
                {discount ? <td className="items">{discountVatPrice.toFixed(2)}</td> : ''}
                {!isLocked && <td />}
            </tr>

            <tr>
                <td className="items" colSpan={spacer}>
                    {t('invoices.toPay')}
                </td>
                <td className="items bold">{(vatPrice + total).toFixed(2)}</td>
                {discount ? (
                    <td className="items bold">{(discountVatPrice + discountTotal).toFixed(2)}</td>
                ) : (
                    ''
                )}
                {!isLocked && <td />}
            </tr>

            {discount ? (
                <tr>
                    <td className="items" colSpan={spacer}>
                        {t('invoices.win')}
                    </td>
                    <td />
                    <td className="items bold">
                        {Number(vatPrice + total - discountVatPrice - discountTotal).toFixed(2)}
                    </td>
                    {!isLocked && <td />}
                </tr>
            ) : null}
        </tfoot>
    );
};

export default Total;
