// A company of the install (GET /tenants, owner only), with counts and never its data
export interface TenantIF {
    id: number;
    name: string;
    active: number;
    created: string;
    people: number;
    invoices: number;
}

// A new company and its first admin (POST /tenants)
export interface NewTenantIF {
    name: string;
    adminEmail: string;
    adminName: string;
}
