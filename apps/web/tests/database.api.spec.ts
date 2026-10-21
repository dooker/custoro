import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';

// Tests the database rules the API relies on: foreign keys, unique keys, all-or-nothing invoice
// creation and the lists. Creates customers, products, worksheets and invoices in the target
// database, and the API cannot delete invoices, so run this against a local or test database only.
test.describe.configure({ mode: 'serial' });

const unique = Date.now().toString(36);

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

const createCustomer = async (name: string) => {
    const body = await call('post', '/customer', {
        name,
        contact: 'Test',
        regNumber: '',
        vatNumber: '',
        phone: '',
        phone2: '',
        address: '',
        email: 'customer@example.test',
        invoiceEmail: '',
        www: '',
        paymentPeriod: 14,
        additionalInfo: '',
        shippingInfo: '',
        department: '',
    });

    expect(body.success, 'customer created').toBe(true);

    return body.insertId as number;
};

const createProduct = async (code: string, price = 19.99) => {
    const body = await call('post', '/product', {
        code,
        name: `Product ${code}`,
        price,
        discountPrice: 0,
        unit: 'pc',
        comment: '',
    });

    expect(body.success, 'product created').toBe(true);

    return body.insertId as number;
};

const createWorksheet = async (customer: number, product: number, quantity = 2) => {
    const body = await call('post', '/worksheet', { customer, product_id: product, quantity });

    expect(body.success, 'worksheet created').toBe(true);

    return body.insertId as number;
};

const getInvoice = async (id: number) => (await call('get', `/invoice/${id}`)).data[0];

const getLastNumber = async () => Number((await call('get', '/invoice/last/')).data);

test.describe('users and emails', () => {
    test('an admin can create a user, also one with a long email', async () => {
        for (const username of [
            `db-${unique}@example.test`,
            // The login email column used to hold 45 characters
            `${'a-very-long-name-'.repeat(4)}${unique}@a-subdomain.example.test`,
        ]) {
            const created = await call('post', '/user', {
                name: 'Database test',
                username,
                discount: 0,
                offer: 0,
                role: 'user',
            });

            expect(created, username).toMatchObject({ success: true });

            const read = await call('get', `/user/${created.insertId}`);

            expect(read.data[0].username).toBe(username);
            expect((await call('delete', `/user/${created.insertId}`)).success).toBe(true);
        }
    });
});

test.describe('search', () => {
    test('a keyword search needs every word, not just the first', async () => {
        const code = `SRCH-${unique}`;

        await createProduct(code);

        const search = async (keyword: string) =>
            (
                await call(
                    'get',
                    `/search?resource=products&keyword=${encodeURIComponent(keyword)}&page=1&limit=10`
                )
            ).resource;

        // "OR" between words used to return everything that had the first word
        expect(await search(`${code} nothing-matches-this`)).toHaveLength(0);
        expect((await search(`${code} Product`)).map((row: { code: string }) => row.code)).toEqual([
            code,
        ]);
        expect(await search('50% does_not exist')).toHaveLength(0);
    });

    test('a keyword search uses the first 8 words only, so it cannot be made expensive', async () => {
        const code = `WORDS-${unique}`;

        await createProduct(code);

        // The first 8 words match, the hundreds after them would not: they are ignored
        const keyword = [code, ...Array(7).fill('Product'), ...Array(500).fill('no-match-here')];
        const started = Date.now();
        const found = await call(
            'get',
            `/search?resource=products&keyword=${encodeURIComponent(keyword.join(' '))}&page=1&limit=10`
        );

        expect(found.success).toBe(true);
        expect(found.resource.map((row: { code: string }) => row.code)).toEqual([code]);
        expect(Date.now() - started, 'answers at once').toBeLessThan(2000);

        // the eighth word still counts, the ninth is the first one that is ignored
        const eighth = [code, ...Array(6).fill('Product'), 'no-match-here'];
        const search = async (words: string[]) =>
            (
                await call(
                    'get',
                    `/search?resource=products&keyword=${encodeURIComponent(words.join(' '))}&page=1&limit=10`
                )
            ).resource;

        expect(await search(eighth)).toHaveLength(0);
        expect(await search([...Array(7).fill('Product'), code, 'no-match-here'])).toHaveLength(1);
    });
});

test.describe('references between customers, products, worksheets and invoices', () => {
    test('a second product with the same code is refused, and says why', async () => {
        const code = `DUP-${unique}`;
        const first = await createProduct(code);
        const second = await call('post', '/product', {
            code,
            name: 'Same code',
            price: 1,
            discountPrice: 0,
            unit: 'pc',
            comment: '',
        });

        expect(second).toEqual({ success: false, message: 'product.exists' });

        // changing another product to that code is refused too, and no longer reported as saved
        const other = await createProduct(`OTH-${unique}`);
        const changed = await call('put', `/product/${other}`, {
            code,
            name: 'Other',
            price: 1,
            discountPrice: 0,
            unit: 'pc',
            comment: '',
        });

        expect(changed).toEqual({ success: false, message: 'product.exists' });
        expect((await call('get', `/product/${first}`)).data[0].code).toBe(code);
    });

    test('prices are stored as written', async () => {
        const id = await createProduct(`PRC-${unique}`, 0.0125);
        const product = (await call('get', `/product/${id}`)).data[0];

        expect(product.price).toBe(0.0125);
        expect(typeof product.price).toBe('number');
    });

    test('a customer or product that worksheets use cannot be deleted, until they are gone', async () => {
        const customer = await createCustomer(`Refs ${unique}`);
        const product = await createProduct(`REF-${unique}`);
        const worksheet = await createWorksheet(customer, product);

        expect(await call('delete', `/customer/${customer}`)).toEqual({
            success: false,
            message: 'customer.inUse',
        });
        expect(await call('delete', `/product/${product}`)).toEqual({
            success: false,
            message: 'product.inUse',
        });
        // still there
        expect((await call('get', `/customer/${customer}`)).data).toHaveLength(1);
        expect((await call('get', `/product/${product}`)).data).toHaveLength(1);

        expect((await call('delete', `/worksheet/${worksheet}`)).success).toBe(true);
        expect((await call('delete', `/customer/${customer}`)).success).toBe(true);
        expect((await call('delete', `/product/${product}`)).success).toBe(true);
    });

    test('a customer with an invoice cannot be deleted, a product that is only on an invoice line can', async () => {
        const customer = await createCustomer(`Billed ${unique}`);
        const product = await createProduct(`LINE-${unique}`);
        const created = await call('post', '/invoice', {
            customerId: customer,
            items: [{ productId: product, quantity: 3 }],
        });

        expect(created.success).toBe(true);
        expect(await call('delete', `/customer/${customer}`)).toEqual({
            success: false,
            message: 'customer.inUse',
        });

        // the line keeps its own copy of the product, so the product can go
        expect((await call('delete', `/product/${product}`)).success).toBe(true);

        const invoice = await getInvoice(created.lastId);

        expect(invoice.items).toHaveLength(1);
        expect(invoice.items[0]).toMatchObject({ code: `LINE-${unique}`, quantity: 3 });
    });
});

test.describe('worksheets on invoices', () => {
    let customer: number;
    let product: number;

    test.beforeAll(async () => {
        customer = await createCustomer(`Sheets ${unique}`);
        product = await createProduct(`SHT-${unique}`);
    });

    test('deleting a worksheet removes its line from an open invoice, but not from a locked one', async () => {
        const open = await createWorksheet(customer, product);
        const issued = await createWorksheet(customer, product);
        const created = await call('post', '/invoice', {
            customerId: customer,
            items: [
                { worksheetId: open, productId: product, quantity: 2 },
                { worksheetId: issued, productId: product, quantity: 2 },
            ],
        });

        expect(created.success).toBe(true);
        expect((await getInvoice(created.lastId)).items).toHaveLength(2);

        // the worksheets are marked as billed on this invoice
        expect((await call('get', `/worksheet/${open}`)).data[0].invoice).toBe(created.lastId);

        expect((await call('delete', `/worksheet/${open}`)).success).toBe(true);
        expect((await getInvoice(created.lastId)).items).toHaveLength(1);

        // once the invoice is locked, its worksheets cannot be deleted from under it
        expect((await call('put', `/invoice/paid/${created.lastId}`)).success).toBe(true);
        expect(await call('delete', `/worksheet/${issued}`)).toEqual({
            success: false,
            message: 'worksheet.locked',
        });
        expect((await getInvoice(created.lastId)).items).toHaveLength(1);
        expect((await call('get', `/worksheet/${issued}`)).data).toHaveLength(1);
    });

    test('removing a line from an invoice opens its worksheet again', async () => {
        const worksheet = await createWorksheet(customer, product);
        const created = await call('post', '/invoice', {
            customerId: customer,
            items: [{ worksheetId: worksheet, productId: product, quantity: 2 }],
        });
        const invoice = await getInvoice(created.lastId);

        expect((await call('get', `/worksheet/${worksheet}`)).data[0].invoice).toBe(created.lastId);

        // a line that is not on this invoice is refused
        expect(
            await call('delete', `/invoice/${created.lastId + 1000000}/${invoice.items[0].id}`)
        ).toEqual({ success: false, message: 'delete.invoice.item' });

        expect(
            (await call('delete', `/invoice/${created.lastId}/${invoice.items[0].id}`)).success
        ).toBe(true);
        // "no invoice" is null now, not 0
        expect((await call('get', `/worksheet/${worksheet}`)).data[0].invoice).toBeNull();
    });

    test('a line quantity can be changed on its own invoice only', async () => {
        const created = await call('post', '/invoice', {
            customerId: customer,
            items: [{ productId: product, quantity: 2 }],
        });
        const item = (await getInvoice(created.lastId)).items[0];

        expect(
            await call('put', `/invoice/${created.lastId + 1000000}/${item.id}`, { value: 9 })
        ).toEqual({ success: false, message: 'put.invoice.items' });
        expect((await getInvoice(created.lastId)).items[0].quantity).toBe(2);

        expect(await call('put', `/invoice/${created.lastId}/${item.id}`, { value: 4.25 })).toEqual({
            success: true,
        });
        expect((await getInvoice(created.lastId)).items[0].quantity).toBe(4.25);
    });

    test('creating an invoice is all or nothing', async () => {
        const worksheet = await createWorksheet(customer, product);
        const before = await getLastNumber();

        // a product that does not exist: nothing is created and the number is not used
        expect(
            await call('post', '/invoice', {
                customerId: customer,
                items: [
                    { productId: product, quantity: 1 },
                    { productId: 2147483000, quantity: 1 },
                ],
            })
        ).toEqual({ success: false, message: 'get.product' });
        expect(await getLastNumber()).toBe(before);

        // a worksheet can be billed once
        const first = await call('post', '/invoice', {
            customerId: customer,
            items: [{ worksheetId: worksheet, productId: product, quantity: 1 }],
        });

        expect(first.success).toBe(true);
        expect(await getLastNumber()).toBe(before + 1);

        const second = await call('post', '/invoice', {
            customerId: customer,
            items: [
                { productId: product, quantity: 1 },
                { worksheetId: worksheet, productId: product, quantity: 1 },
            ],
        });

        expect(second).toEqual({ success: false, message: 'worksheet.invoiced' });
        // no number was used and the first invoice has its one line
        expect(await getLastNumber()).toBe(before + 1);
        expect((await getInvoice(first.lastId)).items).toHaveLength(1);

        // a customer that does not exist is refused by the database, with nothing left behind
        expect(
            await call('post', '/invoice', { customerId: 2147483000, items: [] })
        ).toMatchObject({ success: false });
        expect(await getLastNumber()).toBe(before + 1);
    });
});

test.describe('invoice list', () => {
    test('lists the newest number first and pages through all invoices', async () => {
        const page = async (number: number, limit = 10) =>
            call('get', `/invoices?page=${number}&limit=${limit}`);
        const first = await page(1);

        expect(first.success).toBe(true);

        const numbers = first.resource.map((row: { number: string }) => Number(row.number));

        // numbers that are not plain digits (the demo's INV-...) sort last, as 0
        for (let index = 1; index < numbers.length; index++) {
            expect(numbers[index] <= numbers[index - 1] || Number.isNaN(numbers[index])).toBe(true);
        }

        expect(first.resource[0]).toHaveProperty('total');

        const all = [];

        for (let number = 1; number <= first.meta.total; number++) {
            all.push(...(await page(number)).resource.map((row: { id: number }) => row.id));
        }

        expect(new Set(all).size, 'no invoice is listed twice').toBe(all.length);
    });

    test('filters by customer and keyword together', async () => {
        const customer = await createCustomer(`Lister ${unique}`);
        const product = await createProduct(`LST-${unique}`);
        const created = await call('post', '/invoice', {
            customerId: customer,
            items: [{ productId: product, quantity: 1 }],
        });
        const number = (await getInvoice(created.lastId)).number;

        // a customer and a keyword in one request used to be a SQL error
        const found = await call(
            'get',
            `/search?resource=invoices&keyword=${encodeURIComponent(`Lister ${unique}`)}&customer=${customer}&page=1&limit=10`
        );

        expect(found.success).toBe(true);
        expect(found.resource.map((row: { id: number }) => row.id)).toEqual([created.lastId]);
        expect(found.resource[0]).toMatchObject({ number, total: 1, name: `Lister ${unique}` });

        const none = await call(
            'get',
            `/search?resource=invoices&keyword=nothing-like-this&customer=${customer}&page=1&limit=10`
        );

        expect(none.success).toBe(true);
        expect(none.resource).toHaveLength(0);

        const perCustomer = await call('get', `/invoices?customer=${customer}&page=1&limit=10`);

        expect(perCustomer.resource.map((row: { id: number }) => row.id)).toEqual([created.lastId]);
    });
});
