import type { InvoiceIF, InvoiceProductIF } from '../../types';
import { useAuth } from '../../contexts/Auth';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useQuery } from '@tanstack/react-query';
import { getGeneral } from '../../utils/Getters/getGeneral';
import { RESOURCE } from '../../variables';
import styles from './Total.module.sass';
import { getInvoiceVatRate } from '../../utils/invoiceVat';
import { formatCents, invoiceTotals } from '../../utils/invoiceTotals';

interface TotalIF {
    draft: InvoiceIF | null;
    noVat: boolean;
}

const Total = ({ noVat, draft }: TotalIF) => {
    const { t } = useSafeTranslation();
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
    const vatRate = getInvoiceVatRate(draft?.vat, settings?.vat);
    const items: InvoiceProductIF[] = draft?.items ?? [];
    // In cents, the rule of the PDF: the lines add up to the net and net plus VAT to the total
    const full = invoiceTotals(items, vatRate, noVat);
    const discounted = invoiceTotals(
        items.map(({ discountPrice, quantity }) => ({ price: discountPrice, quantity })),
        vatRate,
        noVat
    );
    const spacer = discount ? 6 : 5;

    return (
        <tfoot className={styles.footer}>
            <tr className={styles.firstRow}>
                <td className="items" colSpan={spacer}>
                    {t('invoices.total')}
                </td>
                <td className="items">{formatCents(full.net)}</td>
                {discount ? <td className="items">{formatCents(discounted.net)}</td> : ''}
                {!isLocked && <td />}
            </tr>

            <tr>
                <td className="items" colSpan={spacer}>
                    {t('invoices.vat')}
                </td>
                <td className="items">{formatCents(full.vat)}</td>
                {discount ? <td className="items">{formatCents(discounted.vat)}</td> : ''}
                {!isLocked && <td />}
            </tr>

            <tr>
                <td className="items" colSpan={spacer}>
                    {t('invoices.toPay')}
                </td>
                <td className="items bold">{formatCents(full.total)}</td>
                {discount ? <td className="items bold">{formatCents(discounted.total)}</td> : ''}
                {!isLocked && <td />}
            </tr>

            {discount ? (
                <tr>
                    <td className="items" colSpan={spacer}>
                        {t('invoices.win')}
                    </td>
                    <td />
                    <td className="items bold">{formatCents(full.total - discounted.total)}</td>
                    {!isLocked && <td />}
                </tr>
            ) : null}
        </tfoot>
    );
};

export default Total;
