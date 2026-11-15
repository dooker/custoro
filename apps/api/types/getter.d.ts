export interface GetterIF {
    // The caller's company (helpers/tenant.ts): every list is filtered by it first
    tenantId: number;
    keyword?: string | null;
    order?: string | null;
    direction?: string | null;
    customerId?: number | null;
}
