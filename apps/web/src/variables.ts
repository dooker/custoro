export const endpoint = import.meta.env.VITE_API_ENDPOINT;

export const lastUrl = 'lastUrl';
export const themeString = 'theme';
export const storageChange = 'storageChange';

export const debounceTimer = 350;

// resources
export const RESOURCE = {
    HOME: `home`,
    LOGIN: 'login',
    FORGOT: 'forgot',
    RESTORE: 'restore',

    PROFILE: 'profile',
    SETTINGS: 'settings',

    PRODUCT: 'product',
    PRODUCTS: 'products',
    CUSTOMER: 'customer',
    CUSTOMERS: 'customers',
    WORKSHEET: 'worksheet',
    WORKSHEETS: 'worksheets',
    WORKSHEETS_PER_CUSTOMER: 'worksheets-per-customer',
    INVOICE: 'invoice',
    INVOICES: 'invoices',
    PDF: 'pdf',
    USERS: 'users',
    USER: 'user',
    USER_AVATAR: 'users.avatar',
} as const;

// paths
export const PATHS = {
    HOME: `/${RESOURCE.HOME}/`,
    LOGIN: `/${RESOURCE.LOGIN}/`,
    FORGOT: `/${RESOURCE.FORGOT}/`,
    RESTORE: `/${RESOURCE.RESTORE}/`,

    PROFILE: `/${RESOURCE.PROFILE}/`,
    SETTINGS: `/${RESOURCE.SETTINGS}/`,
    CHANGELOG: `/changelog/`,
    PDF: `/${RESOURCE.PDF}/`,

    WORKSHEET: `/${RESOURCE.WORKSHEET}/`,
    WORKSHEETS: `/${RESOURCE.WORKSHEETS}/`,
    INVOICE: `/${RESOURCE.INVOICE}/`,
    INVOICES: `/${RESOURCE.INVOICES}/`,
    CUSTOMER: `/${RESOURCE.CUSTOMER}/`,
    CUSTOMERS: `/${RESOURCE.CUSTOMERS}/`,
    PRODUCT: `/${RESOURCE.PRODUCT}/`,
    PRODUCTS: `/${RESOURCE.PRODUCTS}/`,
    USER: `/${RESOURCE.USER}/`,
    USERS: `/${RESOURCE.USERS}/`,
} as const;

export const person =
    'M0,121.42l0-19.63c10.5-4.67,42.65-13.56,44.16-26.41c0.34-2.9-6.5-13.96-8.07-19.26 c-3.36-5.35-4.56-13.85-0.89-19.5c1.46-2.25,0.84-10.44,0.84-13.53c0-30.77,53.92-30.78,53.92,0c0,3.89-0.9,11.04,1.22,14.1 c3.54,5.12,1.71,14.19-1.27,18.93c-1.91,5.57-9.18,16.11-8.56,19.26c2.31,11.74,32.13,19.63,41.52,23.8l0,22.23L0,121.42L0,121.42z';
