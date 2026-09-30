import type { CustomerIF } from "./customer";
import type { InvoiceIF } from "./invoice";
import type { SettingsIF } from "./settings";

export interface PdfIF {
    filename: string;
    invoiceType: "invoice" | "offer";
}

export interface InvoiceTemplateProps {
    invoice: InvoiceIF;
    customer: CustomerIF;
    settings: SettingsIF;
}
