// Who an invoice on screen is billed to, without React, so the rule can be unit tested. A paid
// invoice has the server's copy of its customer, taken when it was marked as paid. A draft that was
// just marked as paid has no copy until the invoice is read again (the save refetches it), so until
// then it shows the customer as it is now, which is what the copy will hold.
import type { InvoiceIF } from '../types';
import type { CustomerIF } from '../types/customer';

type SavedInvoiceIF = Pick<InvoiceIF, 'locked' | 'customerName' | 'customerVatNumber'>;

/** The saved invoice's copy of its customer, when the draft and the saved invoice are both paid. */
export const paidCopy = (draftLocked: boolean, saved: SavedInvoiceIF | null | undefined) =>
    draftLocked && saved?.locked === 1
        ? { name: saved.customerName ?? null, vatNumber: saved.customerVatNumber ?? null }
        : null;

/** The name and VAT number the invoice shows: the copy when there is one, else the live customer. */
export const invoiceReceiver = (
    copy: ReturnType<typeof paidCopy>,
    customer: Pick<CustomerIF, 'name' | 'vatNumber'> | null | undefined
) => copy ?? { name: customer?.name ?? null, vatNumber: customer?.vatNumber ?? null };
