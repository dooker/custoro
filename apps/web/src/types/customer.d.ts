export interface CustomerIF {
    id: number;
    name?: string;
    contact?: string;
    regNumber?: string;
    vatNumber?: string;
    phone?: string;
    phone2?: string;
    email?: string;
    invoiceEmail?: string;
    www?: string;
    paymentPeriod?: number;
    address?: string;
}

export interface CustomerFormIF {
    initialCustomer: CustomerIF | null;
    isNew: boolean;
    type: string;
}
