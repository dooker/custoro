import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';
import { mailsTo, nextPasswordLink } from './helpers/mail';

// Separation guard 4 of docs/multi-tenant.md: two new companies, each with its own admin and data.
// For every endpoint, company A's lists never show company B's rows, and every read, change and
// delete with B's ids finds nothing ("notFound" or no rows, never "forbidden", which would say the
// id exists). Creates companies, people and invoices: the dev or a test database only. The E2E
// admin must be the owner of the install (the demo admin is).
test.describe.configure({ mode: 'serial' });

const unique = Date.now().toString(36);
const password = 'company-pass-123';

let request: APIRequestContext;
let ownerToken: string;

interface Company {
    id: number;
    name: string;
    admin: string;
    token: string;
    customer: number;
    product: number;
    worksheet: number;
    invoice: number;
    item: number;
    adminId: number;
}

const companies: Record<'a' | 'b', Company> = {} as Record<'a' | 'b', Company>;

const call = async (
    token: string,
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    data?: object
) =>
    (
        await request[method](`${apiUrl}${path}`, {
            headers: apiHeaders(token),
            ...(data ? { data } : {}),
        })
    ).json();

const customerBody = (name: string) => ({
    name,
    contact: 'Test',
    regNumber: '',
    vatNumber: '',
    phone: '',
    phone2: '',
    address: '',
    email: `customer-${unique}@example.test`,
    invoiceEmail: '',
    www: '',
    paymentPeriod: 14,
    additionalInfo: '',
    shippingInfo: '',
    department: '',
});

const productBody = (code: string) => ({
    code,
    name: `Product ${code}`,
    price: 10,
    discountPrice: 0,
    unit: 'pc',
    comment: '',
});

// A new company through the owner page, its admin's password set with the emailed link, and the
// same data in each: a customer, a product, a worksheet and an invoice with that worksheet's line
const createCompany = async (key: 'a' | 'b') => {
    const name = `Company ${key.toUpperCase()} ${unique}`;
    const admin = `boss-${key}-${unique}@example.test`;

    const { result, token: link } = await nextPasswordLink(request, admin, () =>
        call(ownerToken, 'post', '/tenants', { name, adminEmail: admin, adminName: `Boss ${key}` })
    );

    expect(result).toMatchObject({ success: true, message: 'user.passwordLinkSent' });
    expect(
        await (
            await request.put(`${apiUrl}/login/token`, {
                headers: apiHeaders(),
                data: { token: link, password },
            })
        ).json()
    ).toEqual({ success: true });

    const token = await getApiToken(request, { username: admin, password });
    const customer = (await call(token, 'post', '/customer', customerBody(`${name} customer`)))
        .insertId as number;
    const product = (await call(token, 'post', '/product', productBody(`P-${key}-${unique}`)))
        .insertId as number;
    const worksheet = (
        await call(token, 'post', '/worksheet', { customer, product_id: product, quantity: 2 })
    ).insertId as number;
    const invoice = (
        await call(token, 'post', '/invoice', {
            customerId: customer,
            items: [{ worksheetId: worksheet, productId: product, quantity: 2 }],
        })
    ).lastId as number;
    const item = (await call(token, 'get', `/invoice/${invoice}`)).data[0].items[0].id as number;
    const adminId = (await call(token, 'get', '/profile')).resource.id as number;

    expect([customer, product, worksheet, invoice, item, adminId].every(Number.isInteger)).toBe(
        true
    );

    companies[key] = {
        id: result.insertId,
        name,
        admin,
        token,
        customer,
        product,
        worksheet,
        invoice,
        item,
        adminId,
    };
};

test.beforeAll(async ({ playwright }) => {
    request = await playwright.request.newContext();
    ownerToken = await getApiToken(request);
    await createCompany('a');
    await createCompany('b');
});

test.afterAll(async () => {
    await request.dispose();
});

test('each company numbers its own invoices from 1 and has its own settings', async () => {
    for (const company of Object.values(companies)) {
        const invoice = (await call(company.token, 'get', `/invoice/${company.invoice}`)).data[0];

        expect(invoice.number).toBe('1');
        expect((await call(company.token, 'get', '/invoice/last/')).data).toBe('1');
        expect((await call(company.token, 'get', '/settings?fields=companyName')).data).toEqual([
            { companyName: company.name },
        ]);
        expect((await call(company.token, 'get', '/profile')).resource.companyName).toBe(
            company.name
        );
    }
});

test("a company's lists and searches never show another company's rows", async () => {
    const { a, b } = companies;
    const lists = [
        '/customers/1?limit=100',
        '/products/1?limit=100',
        '/worksheets/1?limit=100',
        '/invoices/1?limit=100',
        '/users/1?limit=100',
    ];

    for (const path of lists) {
        const body = JSON.stringify(await call(a.token, 'get', path));

        expect(body, path).not.toContain(b.name);
        expect(body, path).not.toContain(`P-b-${unique}`);
        expect(body, path).not.toContain(b.admin);
    }

    for (const [resource, keyword] of [
        ['customers', b.name],
        ['products', `P-b-${unique}`],
        ['invoices', b.name],
        ['worksheets', b.name],
        ['users', b.admin],
    ]) {
        const body = await call(
            a.token,
            'get',
            `/search?resource=${resource}&keyword=${encodeURIComponent(keyword)}`
        );

        expect(body.resource ?? [], `search ${resource}`).toEqual([]);
    }

    // its own rows are found the same way
    const own = await call(
        a.token,
        'get',
        `/search?resource=customers&keyword=${encodeURIComponent(a.name)}`
    );
    expect(own.resource).toHaveLength(1);
});

test("another company's rows cannot be read: no rows, never forbidden", async () => {
    const { a, b } = companies;

    expect(await call(a.token, 'get', `/customer/${b.customer}`)).toEqual({
        success: true,
        data: [],
    });
    expect(await call(a.token, 'get', `/product/${b.product}`)).toMatchObject({ data: [] });
    expect(await call(a.token, 'get', `/worksheet/${b.worksheet}`)).toEqual({
        success: true,
        data: [],
    });
    expect(await call(a.token, 'get', `/user/${b.adminId}`)).toEqual({ success: true, data: [] });
    expect((await call(a.token, 'get', `/invoice/${b.invoice}`)).data ?? []).toEqual([]);
    // the invoices and worksheets of B's customer, asked for by A
    expect(
        (await call(a.token, 'get', `/invoices/1?customer=${b.customer}&limit=100`)).resource
    ).toEqual([]);
    expect(
        (await call(a.token, 'get', `/worksheets/1?customer=${b.customer}&limit=100`)).resource
    ).toEqual([]);
    expect((await call(a.token, 'get', `/invoice/all/${b.customer}`)).data).toEqual([]);
});

test("another company's rows cannot be changed or deleted: not found, and nothing changes", async () => {
    const { a, b } = companies;
    const notFound = { success: false, message: 'notFound' };

    expect(
        await call(a.token, 'put', `/customer/${b.customer}`, customerBody('Taken over'))
    ).toEqual(notFound);
    expect(await call(a.token, 'put', `/product/${b.product}`, productBody('TAKEN'))).toEqual(
        notFound
    );
    expect(
        await call(a.token, 'put', `/worksheet/${b.worksheet}`, {
            customer_id: a.customer,
            product_id: a.product,
            order_id: null,
            quantity: 9,
        })
    ).toEqual(notFound);
    expect(
        await call(a.token, 'put', `/invoice/${b.invoice}`, {
            invoiceId: b.invoice,
            items: [{ productId: a.product, quantity: 1 }],
        })
    ).toEqual(notFound);
    expect(
        await call(a.token, 'put', '/invoice', {
            id: b.invoice,
            customerId: a.customer,
            invoiceDate: '2026-11-15',
            paymentType: 'transfer',
            invoiceType: 'invoice',
            number: '99',
        })
    ).toEqual(notFound);
    expect(await call(a.token, 'put', `/invoice/${b.invoice}/${b.item}`, { value: 9 })).toEqual(
        notFound
    );
    expect(await call(a.token, 'put', `/invoice/paid/${b.invoice}`)).toEqual(notFound);
    expect(await call(a.token, 'delete', `/invoice/${b.invoice}/${b.item}`)).toEqual(notFound);
    expect(await call(a.token, 'delete', `/worksheet/${b.worksheet}`)).toEqual(notFound);
    expect(await call(a.token, 'delete', `/customer/${b.customer}`)).toEqual(notFound);
    expect(await call(a.token, 'delete', `/product/${b.product}`)).toEqual(notFound);
    expect(
        await call(a.token, 'put', `/user/${b.adminId}`, {
            name: 'Taken',
            username: `taken-${unique}@example.test`,
            discount: 0,
            offer: 0,
            role: 'admin',
        })
    ).toEqual(notFound);
    expect(await call(a.token, 'delete', `/user/${b.adminId}`)).toEqual(notFound);

    // company B's rows are as they were
    const customer = (await call(b.token, 'get', `/customer/${b.customer}`)).data[0];
    const invoice = (await call(b.token, 'get', `/invoice/${b.invoice}`)).data[0];

    expect(customer.name).toBe(`${b.name} customer`);
    expect(invoice.locked).toBe(0);
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].quantity).toBe(2);
    expect((await call(b.token, 'get', `/worksheet/${b.worksheet}`)).data[0].invoice).toBe(
        b.invoice
    );
    expect((await call(b.token, 'get', '/profile')).resource.email).toBe(b.admin);
});

test("another company's customers and products cannot be used", async () => {
    const { a, b } = companies;

    // the references include the company, so the database refuses them
    expect(
        (
            await call(a.token, 'post', '/worksheet', {
                customer: b.customer,
                product_id: a.product,
                quantity: 1,
            })
        ).success
    ).toBe(false);
    expect(
        (
            await call(a.token, 'post', '/worksheet', {
                customer: a.customer,
                product_id: b.product,
                quantity: 1,
            })
        ).success
    ).toBe(false);
    expect((await call(a.token, 'post', '/invoice', { customerId: b.customer })).success).toBe(
        false
    );
    // a line copies a product of the caller's company only
    expect(
        await call(a.token, 'put', `/invoice/${a.invoice}`, {
            invoiceId: a.invoice,
            items: [{ productId: b.product, quantity: 1 }],
        })
    ).toEqual({ success: false, message: 'get.product' });
});

test("another company's invoice cannot be emailed or made into a PDF", async () => {
    const { a, b } = companies;
    const customerEmail = `customer-${unique}@example.test`;
    const before = (await mailsTo(request, customerEmail)).length;

    expect((await call(a.token, 'post', '/email', { id: b.invoice })).success).toBe(false);
    expect((await call(a.token, 'put', `/pdf/${b.invoice}`, { language: 'en' })).success).toBe(
        false
    );
    expect((await mailsTo(request, customerEmail)).length).toBe(before);
});

test("each company's PDF of its invoice 1 is its own file behind its own link", async () => {
    const pdfs: Buffer[] = [];

    for (const company of Object.values(companies)) {
        expect(
            (await call(company.token, 'put', `/pdf/${company.invoice}`, { language: 'en' }))
                .success
        ).toBe(true);

        const { hash } = (await call(company.token, 'get', `/invoice/${company.invoice}`)).data[0];
        const response = await request.get(`${apiUrl}/pdf/${hash}`);

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('application/pdf');
        pdfs.push(await response.body());
    }

    // both are invoice_1.pdf, in their own company's folder: not the same file
    expect(pdfs[0].equals(pdfs[1])).toBe(false);
});

test("the accountant's export holds the company's own invoices only", async () => {
    const { a, b } = companies;
    const response = await request.get(
        `${apiUrl}/export/invoices?from=2026-01-01&to=2026-12-31&language=en`,
        { headers: apiHeaders(a.token) }
    );
    const csv = await response.text();

    expect(csv).toContain(`${a.name} customer`);
    expect(csv).not.toContain(b.name);
});

test("only the owner reaches the owner page, and a switched-off company's people are out at once", async () => {
    const { a, b } = companies;

    expect(await call(a.token, 'get', '/tenants')).toEqual({
        success: false,
        message: 'forbidden',
    });
    expect(await call(a.token, 'put', `/tenants/${b.id}`, { active: false })).toEqual({
        success: false,
        message: 'forbidden',
    });

    // the owner switches company B off: its open session ends, its login is refused
    expect(await call(ownerToken, 'put', `/tenants/${b.id}`, { active: false })).toEqual({
        success: true,
    });
    expect(await call(b.token, 'get', '/profile')).toEqual({
        success: false,
        message: 'invalid.token',
    });
    expect(
        await (
            await request.post(`${apiUrl}/login`, {
                headers: apiHeaders(),
                data: { username: b.admin, password },
            })
        ).json()
    ).toMatchObject({ success: false });

    // and back on
    expect(await call(ownerToken, 'put', `/tenants/${b.id}`, { active: true })).toEqual({
        success: true,
    });
    await getApiToken(request, { username: b.admin, password });
});
