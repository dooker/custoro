import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';

// A paid invoice is a record of what was billed to whom: its lines and details cannot change, and
// it keeps the customer's details from when it was paid, whatever happens to the customer later.
// Creates customers, products and invoices, and the API cannot delete invoices: local or test
// databases only.
test.describe.configure({ mode: 'serial' });

const unique = Date.now().toString(36);
const locked = { success: false, message: 'invoice.locked' };

let request: APIRequestContext;
let headers: ReturnType<typeof apiHeaders>;

test.beforeAll(async ({ playwright }) => {
    request = await playwright.request.newContext();
    headers = apiHeaders(await getApiToken(request));
});

test.afterAll(async () => {
    await request.dispose();
});

const call = async (method: 'get' | 'post' | 'put' | 'delete', path: string, data?: object) =>
    (await request[method](`${apiUrl}${path}`, { headers, ...(data ? { data } : {}) })).json();

const customerBody = (changes: object = {}) => ({
    name: `Paid ${unique}`,
    contact: 'Test',
    regNumber: '12345678',
    vatNumber: 'EE123456789',
    phone: '555 0100',
    phone2: '',
    address: 'Old street 1',
    email: 'customer@example.test',
    invoiceEmail: '',
    www: '',
    paymentPeriod: 21,
    additionalInfo: '',
    shippingInfo: '',
    department: 'Accounts',
    ...changes,
});

let customer: number;
let product: number;
let invoiceId: number;

test.beforeAll(async () => {
    const createdCustomer = await call('post', '/customer', customerBody());
    const createdProduct = await call('post', '/product', {
        code: `PAID-${unique}`,
        name: `Paid product ${unique}`,
        price: 10,
        discountPrice: 0,
        unit: 'pc',
        comment: '',
    });

    expect(createdCustomer.success && createdProduct.success).toBe(true);
    customer = createdCustomer.insertId;
    product = createdProduct.insertId;

    const created = await call('post', '/invoice', {
        customerId: customer,
        items: [{ productId: product, quantity: 2 }],
    });

    expect(created.success).toBe(true);
    invoiceId = created.lastId;
    expect((await call('put', `/invoice/paid/${invoiceId}`)).success).toBe(true);
});

const getInvoice = async () => (await call('get', `/invoice/${invoiceId}`)).data[0];

test('a paid invoice cannot be changed', async () => {
    const before = await getInvoice();
    const [line] = before.items;

    expect(
        await call('put', `/invoice/${invoiceId}`, {
            invoiceId,
            items: [{ productId: product, quantity: 1 }],
        })
    ).toEqual(locked);
    expect(await call('put', `/invoice/${invoiceId}/${line.id}`, { value: 9 })).toEqual(locked);
    expect(await call('delete', `/invoice/${invoiceId}/${line.id}`)).toEqual(locked);
    expect(
        await call('put', '/invoice', {
            id: invoiceId,
            number: `${before.number}9`,
            customerId: before.customerId,
            invoiceDate: '2020-01-01',
            paymentType: before.paymentType,
            invoiceType: before.invoiceType,
        })
    ).toEqual(locked);

    const after = await getInvoice();

    expect(after.items).toEqual(before.items);
    expect(after.number).toBe(before.number);
    expect(after.invoiceDate).toBe(before.invoiceDate);
});

test('marking it as paid again changes nothing', async () => {
    const before = await getInvoice();

    expect(await call('put', `/invoice/paid/${invoiceId}`)).toEqual({ success: true });
    expect(await getInvoice()).toEqual(before);
});

test('a paid invoice keeps its customer as billed when the customer changes', async () => {
    expect(
        await call(
            'put',
            `/customer/${customer}`,
            customerBody({
                name: `Renamed ${unique}`,
                address: 'New street 2',
                vatNumber: 'EE999999999',
                paymentPeriod: 7,
            })
        )
    ).toEqual({ success: true });

    const invoice = await getInvoice();

    expect(invoice).toMatchObject({
        customerName: `Paid ${unique}`,
        customerAddress: 'Old street 1',
        customerVatNumber: 'EE123456789',
        customerRegNumber: '12345678',
        customerDepartment: 'Accounts',
        customerPaymentPeriod: 21,
    });

    // The list shows the name it was billed to, and both names find it
    for (const keyword of [`Paid ${unique}`, `Renamed ${unique}`]) {
        const found = await call(
            'get',
            `/search/?resource=invoices&keyword=${encodeURIComponent(keyword)}&page=1&limit=10`
        );

        expect(
            found.resource.map((row: { id: number; name: string }) => [row.id, row.name]),
            keyword
        ).toContainEqual([invoiceId, `Paid ${unique}`]);
    }
});

test('an open invoice follows its customer', async () => {
    const created = await call('post', '/invoice', {
        customerId: customer,
        items: [{ productId: product, quantity: 1 }],
    });
    const invoice = (await call('get', `/invoice/${created.lastId}`)).data[0];

    expect(invoice.locked).toBe(0);
    expect(invoice.customerName ?? null).toBeNull();
    expect(invoice.customerAddress).toBeNull();
    // and can still be changed
    expect(
        await call('put', `/invoice/${created.lastId}/${invoice.items[0].id}`, { value: 3 })
    ).toEqual({
        success: true,
    });
});
