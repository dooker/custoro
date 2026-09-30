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
    customerName?: string;
}

export interface GetProductsMapIF {
    database: string;
    items: InvoiceItemIF[];
}
