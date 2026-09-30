export interface SettingsIF {
    pdfDisclaimer: string;
    companyName: string;
    companyEmail: string;
    companyPhone: string;
    companyAddress1: string;
    companyWebsite: string;
    companyRegNr: string;
    companyAddress2: string;
    companyVatNumber: string;
    companyBankAccount: string;
    companyBankAccount2: string;
    [key: string]: string | number | null;
}

export interface ConfigLogoIF {
    value: string;
}
