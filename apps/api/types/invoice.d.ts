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

// A line as the web app sends it when it adds something to an invoice
export interface RequestedLineIF {
    productId: number;
    quantity: number;
    worksheetId?: number | null;
}
