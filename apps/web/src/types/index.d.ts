import type { Dispatch, ReactNode, SetStateAction } from 'react';
import en from '../../public/locales/en.json';
import type { AxiosRequestConfig } from 'axios';

declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNS: 'translation';
        resources: {
            translation: typeof en;
        };
    }
}

interface ProductIF {
    id: number;
    code?: string;
    name?: string;
    price?: number;
    discountPrice?: number;
    unit?: string;
    comment?: string;
}

interface MetaIF {
    page?: number;
    total?: number;
}

interface DataResponseIF<T> {
    meta?: MetaIF;
    resource: T[];
}

interface SingleGetterIF {
    id: number | string;
    type: string;
    config?: AxiosRequestConfig;
}

interface GetterIF {
    path: string;
    page?: number;
    compact?: boolean;
    id?: number | null;
    customerId?: number | null;
    limit?: number;
}

interface SelectOptionIF {
    label: string;
    value: string;
}

interface ModalIF {
    show: boolean;
    update: (params: Partial<ModalIF>) => void;
    header: string;
    cssClass: string;
    body: ReactNode;
    footer: string | ReactNode;
    closeButton: boolean;
    error: string;
}

interface WorksheetIF {
    id: number;
    code?: string;
    product_id?: number;
    customer?: number;
    order_id?: number;
    quantity?: number;
    invoice?: number;
    name?: string;
    worksheet_count?: number;
    price?: number;
    discountPrice?: number;
}

interface InvoiceProductIF {
    id: number;
    quantity: number;
    name: string;
    code: string;
    price: number;
    discountPrice: number;
    unit: string;
}

interface InvoiceItemsIF {
    draft: InvoiceIF | null;
    onAdd: (EntityOnChangeIF) => void;
    onChange: (EntityOnChangeIF) => void;
}

interface SettingsIF {
    vat?: string;
    lastInvoiceId?: number;
    invoiceFilenamePrefix?: string;
    pdfDisclaimer?: string;
    companyName?: string;
    companyEmail?: string;
    companyPhone?: string;
    companyAddress1?: string;
    companyWebsite?: string;
    companyRegNr?: string;
    companyAddress2?: string;
    companyVatNumber?: string;
    companyBankAccount?: string;
    companyBankAccount2?: string;
    invoiceSubject?: string;
    invoiceText?: string;
    forgotSubject?: string;
    forgotText?: string;
    host?: string;
    port?: string;
    username?: string;
    password?: string;
    invoiceHtml?: string;
    forgotHtml?: string;
    logo?: string | File | null;
}

interface InvoiceIF {
    changeDate: Date;
    createDate: Date;
    invoiceDate: Date;
    customerId: number;
    id: number;
    locked: number;
    number: string;
    paymentType: string;
    invoiceType: string;
    items: Array<InvoiceProductIF>;
    hash: string;
    vat: number;
    customerName?: string;
}

type InvoiceWithCustomerIF = InvoiceIF & {
    name: string;
    total: number;
};

type OptionType = {
    value: string;
    label: string;
};

interface EntityOnChangeIF {
    name: string;
    value: string | File | null | Date | number;
}

type BooleanSetter = Dispatch<SetStateAction<boolean>>;

interface UnitIF {
    label: string;
    value: string;
}

interface UpdateEntityIF {
    click?: boolean;
    newEntity?: ProductIF | CustomerIF;
}

// All possible types for the "value" prop
type FieldValue = string | number | SelectOptionIF | undefined | null | File;

// All possible types for the "setter" state
type FieldState = ProfileIF | SettingsIF | string | number | null;

export interface DefaultListIF {
    list: string;
    loader: boolean;
    renderer: () => ReactNode;
    meta: MetaIF | null | undefined;
    path: string;
    compact?: boolean;
    header: HeaderIF;
}

export interface MutateIF<T> {
    data: T;
    show?: boolean;
}
