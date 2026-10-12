// VAT rate in percent for an invoice. The rate is stored on the invoice when it is created, and the
// PDF always uses it, so the screen does too. Changing the VAT setting later must not change the
// totals of existing invoices. The current setting is only a fallback for an invoice without one.
export const getInvoiceVatRate = (
    invoiceVat: number | string | null | undefined,
    settingsVat: number | string | null | undefined
): number => {
    const stored = Number(invoiceVat);

    if (invoiceVat !== null && invoiceVat !== undefined && invoiceVat !== '' && !isNaN(stored)) {
        return stored;
    }

    const current = Number(settingsVat);

    return isNaN(current) ? 0 : current;
};
