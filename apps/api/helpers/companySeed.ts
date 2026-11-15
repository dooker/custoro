// The settings a new company starts with: the same rows db/02-seed.sql gives company 1 of a fresh
// install (a test keeps the two the same). The company name is filled in from the name the owner
// gives the company; everything else is set on the company's settings page.
export const companySeedRows: [name: string, value: string][] = [
    ["lastInvoiceId", "0"],
    ["vat", "24"],
    ["companyName", ""],
    ["companyEmail", ""],
    ["companyPhone", ""],
    ["companyAddress1", ""],
    ["companyAddress2", ""],
    ["companyWebsite", ""],
    ["companyRegNr", ""],
    ["companyVatNumber", ""],
    ["companyBankAccount", ""],
    ["companyBankAccount2", ""],
    ["pdfDisclaimer", ""],
    ["logo", ""],
    ["invoiceSubject", ""],
    ["invoiceText", ""],
    ["invoiceHtml", ""],
    ["forgotSubject", ""],
    ["forgotText", ""],
    ["forgotHtml", ""],
    ["invoiceFilenamePrefix", "invoice_"]
];

/** The settings rows of a new company, its name in companyName */
export const companySeed = (companyName: string) =>
    companySeedRows.map(([name, value]): [string, string] => [
        name,
        name === "companyName" ? companyName : value
    ]);

// Owner page input: a company name is one line, 1 to 150 characters (tenants.name)
export const maxCompanyNameLength = 150;

export const companyName = (value: unknown): string | null => {
    if (typeof value !== "string") {
        return null;
    }

    const name = value.trim();

    return name && name.length <= maxCompanyNameLength && !/[\r\n\0]/.test(name) ? name : null;
};
