// What PUT /settings accepts, without Express or the database, so it can be unit tested.
// The body is checked key by key: a key that is not a setting is refused instead of ignored,
// so nothing can be written to the config table (or the mail file) that the app does not read.

export const mailFields = ["host", "port", "username", "password"] as const;
export type MailField = (typeof mailFields)[number];

// Stored in config.long_value; every other setting is a short value (config.value, 250 chars)
export const longFields = ["invoiceText", "invoiceHtml", "forgotText", "forgotHtml"];
const shortFields = [
    "lastInvoiceId",
    "vat",
    "companyName",
    "companyEmail",
    "companyPhone",
    "companyAddress1",
    "companyAddress2",
    "companyWebsite",
    "companyRegNr",
    "companyVatNumber",
    "companyBankAccount",
    "companyBankAccount2",
    "pdfDisclaimer",
    "invoiceSubject",
    "forgotSubject",
    "invoiceFilenamePrefix"
];

// The logo is a file upload (and DELETE /settings); the web form sends its current name along,
// which is accepted and ignored.
const ignoredFields = ["logo"];

const maxShortLength = 250;
const maxMailLength = 255;

// Per setting, a rule on top of "is a string". lastInvoiceId feeds the next invoice number and
// vat every new invoice, so a bad value there would break invoicing.
const rules: Record<string, (value: string) => boolean> = {
    lastInvoiceId: (value) => /^\d{1,9}$/.test(value),
    vat: (value) => /^\d{1,3}(\.\d{1,2})?$/.test(value) && Number(value) <= 100,
    port: (value) => value === "" || (/^\d{1,5}$/.test(value) && Number(value) <= 65535)
};

export const settingsInvalidMessage = "settingsInvalid";

export interface SettingsInputIF {
    // config table rows to update, by name
    short: [string, string][];
    long: [string, string][];
    // mail server fields that were sent (written to .env.email, not to the database)
    mail: Partial<Record<MailField, string>>;
}

export type SettingsInputResultIF =
    { success: true; input: SettingsInputIF } | { success: false; message: string };

// Form posts send numbers as text, a JSON client may send real numbers; nothing else is a value
const asText = (value: unknown) =>
    typeof value === "string"
        ? value
        : typeof value === "number" && Number.isFinite(value)
          ? String(value)
          : undefined;

export const parseSettingsInput = (body: unknown): SettingsInputResultIF => {
    const fail = (message = settingsInvalidMessage) => ({ success: false as const, message });

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return fail();
    }

    const input: SettingsInputIF = { short: [], long: [], mail: {} };

    for (const [key, raw] of Object.entries(body)) {
        if (ignoredFields.includes(key)) {
            continue;
        }

        const isMail = (mailFields as readonly string[]).includes(key);
        const isLong = longFields.includes(key);

        if (!isMail && !isLong && !shortFields.includes(key)) {
            return fail();
        }

        const value = asText(raw);

        if (value === undefined) {
            return fail();
        }

        if (!isLong && value.length > (isMail ? maxMailLength : maxShortLength)) {
            return fail();
        }

        if (rules[key] && !rules[key](value)) {
            return fail();
        }

        if (isMail) {
            input.mail[key as MailField] = value;
        } else if (isLong) {
            input.long.push([key, value]);
        } else {
            input.short.push([key, value]);
        }
    }

    return { success: true, input };
};
