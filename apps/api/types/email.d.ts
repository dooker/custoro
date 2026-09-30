import { AttachmentsType } from "./index";
import { allowedEmailKeys } from "../variables";

export interface EmailCustomerIF {
    name: string;
    email: string;
    invoiceEmail: string;
    filename?: string;
    hash: string;
}

export type AllowedEmailKey = (typeof allowedEmailKeys)[number];
export type EmailConfigResult = Partial<Record<AllowedEmailKey, string>>;

export interface EmailConfigIF {
    name: string;
    value: string;
    longValue: string;
}

export interface EmailIF {
    email: string;
    config: EmailConfigResult | undefined;
    attachments?: AttachmentsType;
    replace?: Record<string, string>;
}
