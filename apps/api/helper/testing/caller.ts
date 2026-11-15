// The caller of a fake request in the unit tests: an admin of company 1, as authenticate sets it.
// Tests about another company or role spread their own over it.
export const testCaller = { id: 1, role: "admin", tv: 0, tenantId: 1, owner: false };
