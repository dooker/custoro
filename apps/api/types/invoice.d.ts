export interface InvoiceItemIF {
    id: number;
    quantity: number;
    code: string;
    name: string;
    price: string;
    discountPrice: string;
    unit: string;
    comment: string;
    productId: number;
}

export interface InvoiceIF {
    id: number;
    number: number;
    customerId: number;
    createDate: Date | string;
    changeDate: Date | string;
    invoiceDate: Date | string;
    paymentType: string;
    invoiceType: string;
    locked: number;
    vat: number;
    sentDate: Date;
    hash: string;
    filename: string;
    items: InvoiceItemIF[] | undefined;
    paymentPeriod?: number;
    // The customer as billed: copied when the invoice is marked as paid, null before
    customerName?: string | null;
    customerRegNumber?: string | null;
    customerVatNumber?: string | null;
    customerAddress?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    customerDepartment?: string | null;
    customerPaymentPeriod?: number | null;
}
