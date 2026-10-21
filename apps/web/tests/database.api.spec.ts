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

test.describe('creating the same user at the same time', () => {
    test('10 parallel requests with one email give one user and nine "user.exists", not a generic error', async () => {
        const username = `race-${unique}@example.test`;
        const body = { name: 'Race', username, discount: 0, offer: 0, role: 'user' };
        const answers = await Promise.all(
            Array.from({ length: 10 }, () => call('post', '/user', body))
        );
        const created = answers.filter((answer) => answer.success);
        const refused = answers.filter((answer) => !answer.success);

        expect(created).toHaveLength(1);
        expect(refused).toHaveLength(9);

        for (const answer of refused) {
            expect(answer).toEqual({ success: false, message: 'user.exists' });
        }

        expect((await call('delete', `/user/${created[0].insertId}`)).success).toBe(true);
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

test.describe('write bodies', () => {
    const invalidInput = { success: false, message: 'invalidInput' };

    const customerBody = (changes: object = {}) => ({
        name: `Body ${unique}`,
        contact: null,
        regNumber: '',
        vatNumber: null,
        phone: '',
        phone2: '',
        address: '',
        email: 'body@example.test',
        invoiceEmail: '',
        www: '',
        paymentPeriod: '14',
        additionalInfo: null,
        shippingInfo: null,
        department: '',
        ...changes,
    });

    const productBody = (changes: object = {}) => ({
        code: `BODY-${unique}`,
        name: 'Body product',
        price: '19,99',
        discountPrice: 0,
        unit: 'pc',
        comment: '',
        ...changes,
    });

    const customerCount = async () => (await call('get', '/customers?page=1&limit=1')).meta.total;

    test('a customer name that is an object or a list is refused, where it used to be stored as "[object Object]"', async () => {
        const before = await customerCount();

        for (const name of [{ a: 1 }, ['x'], [['x']]]) {
            expect(await call('post', '/customer', customerBody({ name }))).toEqual(invalidInput);
        }

        expect(await customerCount()).toBe(before);

        const id = await createCustomer(`Body edit ${unique}`);

        expect(await call('put', `/customer/${id}`, customerBody({ name: { a: 1 } }))).toEqual(
            invalidInput
        );
        expect((await call('get', `/customer/${id}`)).data[0].name).toBe(`Body edit ${unique}`);
    });

    test('text that is longer than its column is refused, and the longest text is kept', async () => {
        expect(await call('post', '/customer', customerBody({ name: 'x'.repeat(151) }))).toEqual(
            invalidInput
        );

        const created = await call('post', '/customer', customerBody({ name: 'x'.repeat(150) }));

        expect(created.success).toBe(true);
        expect((await call('get', `/customer/${created.insertId}`)).data[0].name).toHaveLength(150);
    });

    test('what the web app sends is accepted: null fields, a payment period and prices as text', async () => {
        const created = await call('post', '/customer', customerBody());

        expect(created.success).toBe(true);

        const read = (await call('get', `/customer/${created.insertId}`)).data[0];

        expect(read).toMatchObject({ contact: null, vatNumber: null, paymentPeriod: 14 });
        // and the stored customer goes back the way the form sends its draft
        expect(await call('put', `/customer/${created.insertId}`, read)).toEqual({ success: true });

        const product = await call('post', '/product', productBody());

        expect(product.success).toBe(true);
        expect((await call('get', `/product/${product.insertId}`)).data[0].price).toBe(19.99);
    });

    test('a product code that is a list is refused, where it used to be expanded into SQL', async () => {
        const code = `LIST-${unique}`;

        for (const value of [[[code]], [code]]) {
            expect(await call('post', '/product', productBody({ code: value }))).toEqual(
                invalidInput
            );
        }

        expect((await call('get', `/product?code=${code}`)).data).toBe(0);
        expect((await call('get', `/product?code[]=${code}`)).success).toBe(false);

        const id = await createProduct(`LISTED-${unique}`);

        expect(
            await call('put', `/product/${id}`, productBody({ code: [`LISTED-${unique}`] }))
        ).toEqual(invalidInput);
        expect(await call('post', '/product', productBody({ unit: 'box' }))).toEqual(invalidInput);
        expect(await call('post', '/product', productBody({ price: 'cheap' }))).toEqual(
            invalidInput
        );
    });

    test('a worksheet needs a customer, a product and a quantity that are numbers', async () => {
        const customer = await createCustomer(`Body sheets ${unique}`);
        const product = await createProduct(`BSH-${unique}`);
        const sheet = { customer, product_id: product, quantity: 2 };

        for (const change of [
            { customer: [customer] },
            { customer: { a: 1 } },
            { product_id: `${product} OR 1=1` },
            { quantity: 'lots' },
            { quantity: [2] },
        ]) {
            expect(await call('post', '/worksheet', { ...sheet, ...change })).toEqual(invalidInput);
        }

        const id = await createWorksheet(customer, product);

        expect(
            await call('put', `/worksheet/${id}`, { customer_id: [customer], product_id: product })
        ).toEqual(invalidInput);
        // the stored worksheet goes back the way the form sends its draft; the URL says which one
        const stored = (await call('get', `/worksheet/${id}`)).data[0];

        expect(
            await call('put', `/worksheet/${id}`, { ...stored, id: id + 1000000, quantity: '3,5' })
        ).toEqual({ success: true });
        expect((await call('get', `/worksheet/${id}`)).data[0].quantity).toBe(3.5);
    });

    test('a user needs a login email and a known role, and a name that is text', async () => {
        const username = `body-${unique}@example.test`;
        const ann = { name: 'Body', username, discount: 0, offer: 0, role: 'user' };

        for (const change of [
            { name: { a: 1 } },
            { username: [username] },
            { username: '' },
            { role: 'root' },
            { discount: 'yes' },
        ]) {
            expect(await call('post', '/user', { ...ann, ...change })).toEqual(invalidInput);
        }

        const created = await call('post', '/user', ann);

        expect(created.success).toBe(true);
        expect(await call('put', `/user/${created.insertId}`, { ...ann, name: { a: 1 } })).toEqual(
            invalidInput
        );
        expect((await call('get', `/user/${created.insertId}`)).data[0].name).toBe('Body');
        expect((await call('delete', `/user/${created.insertId}`)).success).toBe(true);
    });

    test('an invoice needs a customer, lines and details that are valid', async () => {
        const customer = await createCustomer(`Body invoice ${unique}`);
        const product = await createProduct(`BIN-${unique}`);
        const before = await getLastNumber();

        for (const body of [
            { customerId: { a: 1 }, items: [] },
            { customerId: [customer], items: [] },
            { customerId: customer, items: [{ productId: [product], quantity: 1 }] },
            { customerId: customer, items: [{ productId: product, quantity: 'lots' }] },
            { customerId: customer, items: [{ productId: product, quantity: 1, worksheetId: {} }] },
        ]) {
            expect(await call('post', '/invoice', body), JSON.stringify(body)).toMatchObject({
                success: false,
            });
        }

        // nothing was created and no number was used
        expect(await getLastNumber()).toBe(before);

        const created = await call('post', '/invoice', {
            customerId: customer,
            items: [{ productId: product, quantity: '2,5' }],
        });
        const invoice = await getInvoice(created.lastId);

        expect(invoice.items[0].quantity).toBe(2.5);

        const details = {
            id: invoice.id,
            number: invoice.number,
            customerId: invoice.customerId,
            invoiceDate: invoice.invoiceDate,
            paymentType: invoice.paymentType,
            invoiceType: invoice.invoiceType,
        };

        for (const change of [
            { invoiceDate: 'tomorrow' },
            { paymentType: 'gold' },
            { number: ['1'] },
            { customerId: { a: 1 } },
            { id: `${invoice.id} OR 1=1` },
        ]) {
            expect(await call('put', '/invoice', { ...details, ...change })).toEqual(invalidInput);
        }

        // the whole invoice, as the web app sends its draft
        expect(await call('put', '/invoice', invoice)).toEqual({ success: true });
        // an invoice without a customer can be saved too
        expect(await call('put', '/invoice', { ...invoice, customerId: null })).toEqual({
            success: true,
        });
        expect(
            await call('put', `/invoice/${invoice.id}/${invoice.items[0].id}`, { value: [4] })
        ).toEqual(invalidInput);
        expect(await call('put', `/invoice/${invoice.id}`, { invoiceId: [invoice.id] })).toEqual(
            invalidInput
        );
    });
});

test.describe('ids in paths', () => {
    const refused = { success: false, message: 'error' };

    test('an id that is not a whole number is refused, where MySQL read its leading digits', async () => {
        const id = await createCustomer(`Ids ${unique}`);

        // "1 OR 1=1" and "1;DROP TABLE users" found customer 1, and "1e3" found customer 1000
        for (const bad of [
            `${id}%20OR%201=1`,
            `${id};DROP%20TABLE%20users`,
            `${id}e3`,
            `${id}.5`,
            `0${id}`,
            '0',
            '-1',
            'abc',
            '99999999999',
        ]) {
            for (const [method, path] of [
                ['get', '/customer'],
                ['put', '/customer'],
                ['delete', '/customer'],
                ['get', '/product'],
                ['put', '/product'],
                ['delete', '/product'],
                ['get', '/worksheet'],
                ['delete', '/worksheet'],
                ['get', '/user'],
                ['delete', '/user'],
                ['get', '/invoice'],
            ] as const) {
                expect(
                    await call(
                        method,
                        `${path}/${bad}`,
                        method === 'put' ? { name: 'x' } : undefined
                    ),
                    `${method} ${path}/${bad}`
                ).toEqual(refused);
            }
        }

        // a delete that was refused deleted nothing
        expect((await call('get', `/customer/${id}`)).data[0].name).toBe(`Ids ${unique}`);
    });

    test('the invoice routes refuse a bad id and still take "all", "last" and "paid"', async () => {
        const customer = await createCustomer(`Ids invoice ${unique}`);
        const product = await createProduct(`IDS-${unique}`);
        const created = await call('post', '/invoice', {
            customerId: customer,
            items: [{ productId: product, quantity: 1 }],
        });
        const invoice = await getInvoice(created.lastId);

        expect(await call('get', `/invoice/${created.lastId}%20OR%201=1`)).toEqual(refused);
        expect(await call('get', `/invoice/${created.lastId}e0`)).toEqual(refused);
        expect(await call('get', '/invoice/all')).toEqual(refused);
        expect(await call('get', '/invoice/all/abc')).toEqual(refused);
        expect(
            await call('put', `/invoice/${created.lastId}/${invoice.items[0].id}%20OR%201=1`, {
                value: 2,
            })
        ).toEqual(refused);
        expect(
            await call('put', `/invoice/${created.lastId}%201/${invoice.items[0].id}`, { value: 2 })
        ).toEqual(refused);
        expect(await call('put', '/invoice/paid/abc')).toEqual(refused);
        expect(
            await call('delete', `/invoice/${created.lastId}/${invoice.items[0].id}%20OR%201=1`)
        ).toEqual(refused);
        // nothing changed
        expect((await getInvoice(created.lastId)).items).toHaveLength(1);
        expect((await getInvoice(created.lastId)).items[0].quantity).toBe(1);

        expect(
            (await call('get', `/invoice/all/${customer}`)).data.map(
                (row: { id: number }) => row.id
            )
        ).toEqual([created.lastId]);
        expect(Number((await call('get', '/invoice/last/')).data)).toBeGreaterThan(0);
        expect((await call('put', `/invoice/paid/${created.lastId}`)).success).toBe(true);
        expect((await getInvoice(created.lastId)).locked).toBe(1);
    });

    test('adding a line to an invoice does not need an id in the path: the web app sends 0', async () => {
        const customer = await createCustomer(`Ids line ${unique}`);
        const product = await createProduct(`IDL-${unique}`);
        const created = await call('post', '/invoice', { customerId: customer, items: [] });

        expect(
            await call('put', '/invoice/0/', {
                invoiceId: created.lastId,
                items: [{ productId: product, quantity: 0 }],
            })
        ).toEqual({ success: true });
        expect((await getInvoice(created.lastId)).items).toHaveLength(1);
    });
});

test.describe('errors', () => {
    const send = (path: string, data: string) =>
        request.post(`${apiUrl}${path}`, {
            headers: { ...headers, 'Content-Type': 'application/json' },
            data,
        });

    test('a body over 100 KB is a 413, and malformed JSON a 400, not a 500', async () => {
        const large = await send('/customer', JSON.stringify({ name: 'x'.repeat(150 * 1024) }));

        expect(large.status()).toBe(413);
        expect(await large.json()).toMatchObject({ success: false });

        const malformed = await send('/customer', '{"name": oops}');

        expect(malformed.status()).toBe(400);
        expect(await malformed.json()).toMatchObject({ success: false });
        // the answer does not quote what was sent
        expect(JSON.stringify(await malformed.json())).not.toContain('oops');

        // a body that is fine is not affected
        expect((await send('/customer', '{"name": "Fine"}')).status()).toBe(200);
    });

    test('changing, deleting or clearing the avatar of a user that does not exist is success: false, not a 500', async () => {
        const missing = 2147483000;
        const ann = { name: 'Nobody', username: `nobody-${unique}@example.test`, role: 'user' };

        for (const [method, path, data] of [
            ['put', `/user/${missing}`, ann],
            ['delete', `/user/${missing}`, undefined],
            ['delete', `/user/avatar/${missing}`, undefined],
        ] as const) {
            const response = await request[method](`${apiUrl}${path}`, {
                headers,
                ...(data ? { data } : {}),
            });

            expect(response.status(), `${method} ${path}`).toBe(200);
            expect(await response.json(), `${method} ${path}`).toMatchObject({ success: false });
        }

        // the failed change did not create the user
        expect(
            (await call('get', `/search?resource=users&keyword=${ann.username}&page=1&limit=10`))
                .resource ?? []
        ).toHaveLength(0);
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

        expect(await call('put', `/invoice/${created.lastId}/${item.id}`, { value: 4.25 })).toEqual(
            {
                success: true,
            }
        );
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
        expect(await call('post', '/invoice', { customerId: 2147483000, items: [] })).toMatchObject(
            { success: false }
        );
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
