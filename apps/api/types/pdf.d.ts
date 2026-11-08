import type { CustomerIF } from "./customer";
import type { InvoiceIF } from "./invoice";
import type { SettingsIF } from "./settings";
import type { TFunction } from "i18next";

export interface PdfIF {
    filename: string;
    invoiceType: "invoice" | "offer";
}

export interface InvoiceTemplateProps {
    invoice: InvoiceIF;
    customer: CustomerIF;
    settings: SettingsIF;
    /** The texts in this PDF's language (services/pdf.tsx pdfTranslator), never the shared i18n */
    t: TFunction;
}
