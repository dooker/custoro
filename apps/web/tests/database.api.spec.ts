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

    test('a number the database would round up past its column is refused, not a database error', async () => {
        const customer = await createCustomer(`Body limits ${unique}`);
        const product = await createProduct(`LIM-${unique}`);
        const sheet = { customer, product_id: product };

        // quantities are DECIMAL(12,3): 999999999.9996 rounds up to 1000000000.000
        expect(await call('post', '/worksheet', { ...sheet, quantity: 999999999.9996 })).toEqual(
            invalidInput
        );
        expect(await call('post', '/worksheet', { ...sheet, quantity: '999999999.9995' })).toEqual(
            invalidInput
        );

        // and one that rounds down fits; the database keeps the 3 decimals
        const fits = await call('post', '/worksheet', { ...sheet, quantity: 999999999.9994 });

        expect(fits.success).toBe(true);
        expect((await call('get', `/worksheet/${fits.insertId}`)).data[0].quantity).toBe(
            999999999.999
        );

        // prices are DECIMAL(12,4): 99999999.99999 rounds up to 100000000.0000
        expect(await call('post', '/product', productBody({ price: 99999999.99999 }))).toEqual(
            invalidInput
        );
        expect(
            await call(
                'post',
                '/product',
                productBody({ code: `LIM2-${unique}`, discountPrice: '99999999.99996' })
            )
        ).toEqual(invalidInput);

        const top = await call(
            'post',
            '/product',
            productBody({ code: `LIM3-${unique}`, price: 99999999.9999 })
        );

        expect(top.success).toBe(true);
        expect((await call('get', `/product/${top.insertId}`)).data[0].price).toBe(99999999.9999);
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

    test('the details of an invoice are not saved for a customer that cannot be read', async () => {
        const customer = await createCustomer(`Body terms ${unique}`);
        const created = await call('post', '/invoice', { customerId: customer, items: [] });
        const invoice = await getInvoice(created.lastId);

        // a customer that does not exist: the invoice keeps its customer, and so its payment terms
        expect(await call('put', '/invoice', { ...invoice, customerId: 2147483000 })).toEqual({
            success: false,
            message: 'get.customer',
        });

        const after = await getInvoice(created.lastId);

        expect(after.customerId).toBe(customer);
        expect(after.paymentPeriod).toBe(invoice.paymentPeriod);
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

test.describe('the invoice counter', () => {
    const setCounter = (value: number | string) =>
        call('put', '/settings', { lastInvoiceId: String(value) });

    test('cannot be set below a number that an invoice already has, and the next invoice still gets the next number', async () => {
        const customer = await createCustomer(`Counter ${unique}`);
        const created = await call('post', '/invoice', { customerId: customer, items: [] });
        const used = Number((await getInvoice(created.lastId)).number);

        // This is how the counter used to be set below the numbers in use: the next invoice then
        // failed with a generic error, every time
        for (const value of [used - 5, used - 1, 0]) {
            expect(await setCounter(value), `counter ${value}`).toEqual({
                success: false,
                message: 'lastInvoiceIdTooLow',
            });
        }

        // other settings are refused with it, and nothing was saved
        expect(
            await call('put', '/settings', { lastInvoiceId: String(used - 5), vat: '24' })
        ).toMatchObject({ success: false, message: 'lastInvoiceIdTooLow' });

        const next = await call('post', '/invoice', { customerId: customer, items: [] });

        expect(next.success).toBe(true);
        expect(Number((await getInvoice(next.lastId)).number)).toBeGreaterThan(used);
    });

    test('is not left below a number that was handed out while the settings were being saved', async () => {
        const customer = await createCustomer(`Counter race ${unique}`);

        // Saving the Settings page writes the counter it loaded, at the same moment invoices are
        // created. Each save is either applied before the invoices or refused because an invoice got
        // there first; it must never be applied after them and leave the counter behind their numbers.
        for (let round = 0; round < 12; round++) {
            const start = Number(await getLastNumber());
            const answers = await Promise.all([
                ...Array.from({ length: 6 }, () => setCounter(start)),
                ...Array.from({ length: 6 }, () =>
                    call('post', '/invoice', { customerId: customer, items: [] })
                ),
            ]);
            const saves = answers.slice(0, 6);
            const created = answers.slice(6);

            for (const saved of saves) {
                expect(
                    saved.success || saved.message === 'lastInvoiceIdTooLow',
                    `round ${round}: ${JSON.stringify(saved)}`
                ).toBe(true);
            }

            for (const invoice of created) {
                expect(invoice.success, `round ${round}`).toBe(true);
            }

            const numbers = await Promise.all(
                created.map(async ({ lastId }) => Number((await getInvoice(lastId)).number))
            );

            expect(new Set(numbers).size, `round ${round}: numbers are unique`).toBe(
                numbers.length
            );
            expect(
                Number(await getLastNumber()),
                `round ${round}: the counter is at or past the highest number issued`
            ).toBeGreaterThanOrEqual(Math.max(...numbers));
        }
    });

    test('can be set to the number in use, or above it, which skips numbers', async () => {
        const customer = await createCustomer(`Counter up ${unique}`);
        const created = await call('post', '/invoice', { customerId: customer, items: [] });
        // The same value as now: what a Settings page that is up to date sends along with any other
        // change. Other tests create invoices at the same time, so a counter that has just been
        // read can already be below the invoices created since; asking again settles it.
        let used = 0;
        let same;

        for (let attempt = 0; attempt < 5; attempt++) {
            used = Number(await getLastNumber());
            same = await setCounter(used);

            if (same.success) break;
        }

        expect(same).toEqual({ success: true });

        // counters are only ever raised here: other tests create invoices at the same time
        const raised = used + 10;

        expect(await setCounter(raised)).toEqual({ success: true });
        expect(await getLastNumber()).toBeGreaterThanOrEqual(raised);

        const next = await call('post', '/invoice', { customerId: customer, items: [] });

        expect(next.success).toBe(true);
        expect(Number((await getInvoice(next.lastId)).number)).toBeGreaterThan(raised);
        expect(created.success).toBe(true);
    });
});

test.describe('profile', () => {
    test('the last seen time is not written on every request, only when it is 5 minutes old', async () => {
        const seen = async () => (await call('get', '/profile')).resource.timestamp;
        const pause = () => new Promise((resolve) => setTimeout(resolve, 1200));

        // The first request brings an old time up to date. After that the time stays put: every
        // request used to move it, which is a write to the users table for each page the user opens.
        await seen();
        await pause();

        const first = await seen();

        await pause();

        expect(await seen()).toBe(first);
    });
});

test.describe('invoices without a customer', () => {
    test('a paid invoice without a customer can be read back, like any other', async () => {
        const created = await call('post', '/invoice', { items: [] });

        expect(created.success).toBe(true);
        expect((await call('put', `/invoice/paid/${created.lastId}`)).success).toBe(true);

        // reading a paid invoice looks up its customer's name; with no customer it used to fail
        const read = await call('get', `/invoice/${created.lastId}`);

        expect(read.success).toBe(true);
        expect(read.data[0]).toMatchObject({ id: created.lastId, locked: 1, customerId: null });
        expect(read.data[0].customerName).toBeUndefined();

        // an open one too
        const open = await call('post', '/invoice', { items: [] });

        expect((await call('get', `/invoice/${open.lastId}`)).data[0]).toMatchObject({
            id: open.lastId,
            locked: 0,
        });
    });

    test('has no PDF to make, which is an answer and not a crash', async () => {
        const created = await call('post', '/invoice', { items: [] });
        const response = await request.put(`${apiUrl}/pdf/${created.lastId}`, {
            headers,
            data: { language: 'en' },
        });

        expect(response.status()).toBe(200);
        expect(await response.json()).toMatchObject({ success: false });
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

test.describe('worksheets grouped by customer', () => {
    test('lists the customer with the newest worksheet first, with the number of worksheets of each', async () => {
        const product = await createProduct(`GRP-${unique}`);
        const older = await createCustomer(`Grouped older ${unique}`);
        const newer = await createCustomer(`Grouped newer ${unique}`);

        await createWorksheet(older, product);
        await createWorksheet(older, product);
        await createWorksheet(newer, product);
        // the older customer gets the newest worksheet now
        await createWorksheet(older, product);

        const list = await call('get', '/worksheets?page=1&limit=50');

        expect(list.success).toBe(true);

        const names = list.resource.map((row: { name: string }) => row.name);
        const rowOf = (name: string) =>
            list.resource.find((row: { name: string }) => row.name === name);

        expect(names.indexOf(`Grouped older ${unique}`)).toBeGreaterThanOrEqual(0);
        expect(names.indexOf(`Grouped older ${unique}`)).toBeLessThan(
            names.indexOf(`Grouped newer ${unique}`)
        );
        expect(rowOf(`Grouped older ${unique}`)).toMatchObject({
            id: older,
            worksheet_count: 3,
        });
        expect(rowOf(`Grouped newer ${unique}`)).toMatchObject({
            id: newer,
            worksheet_count: 1,
        });
        // a customer is listed once
        expect(new Set(list.resource.map((row: { id: number }) => row.id)).size).toBe(
            list.resource.length
        );
    });

    test('counts the pages by customers: the last page has rows and the one after it none', async () => {
        const limit = 10;
        const first = await call('get', `/worksheets?page=1&limit=${limit}`);
        const pages = first.meta.total;

        expect(pages).toBeGreaterThanOrEqual(1);
        expect(first.resource.length).toBeGreaterThan(0);

        const last = await call('get', `/worksheets?page=${pages}&limit=${limit}`);

        expect(last.resource.length).toBeGreaterThan(0);
        expect(last.resource.length).toBeLessThanOrEqual(limit);
        expect(
            (await call('get', `/worksheets?page=${pages + 1}&limit=${limit}`)).resource
        ).toHaveLength(0);
    });

    test('is the same through the search, with and without a keyword', async () => {
        const product = await createProduct(`GRS-${unique}`);
        const customer = await createCustomer(`Grouped search ${unique}`);

        await createWorksheet(customer, product);
        await createWorksheet(customer, product);

        const search = async (keyword: string) =>
            call(
                'get',
                `/search?resource=worksheets&keyword=${encodeURIComponent(keyword)}&page=1&limit=10`
            );

        // without a keyword the customer with the newest worksheets comes first
        const all = await search('');

        expect(all.success).toBe(true);
        expect(all.resource[0]).toMatchObject({ id: customer, worksheet_count: 2 });

        // with one only the customers whose names have it
        const found = await search(`Grouped search ${unique}`);

        expect(found.success).toBe(true);
        expect(found.resource).toEqual([
            { name: `Grouped search ${unique}`, id: customer, worksheet_count: 2 },
        ]);
        expect((await search(`nobody-${unique}`)).resource).toHaveLength(0);
    });
});

test.describe('invoice list', () => {
    test('lists the newest number first, and pages through the first pages and the last one', async () => {
        const page = async (number: number, limit = 10) =>
            call('get', `/invoices?page=${number}&limit=${limit}`);
        const first = await page(1);

        expect(first.success).toBe(true);

        const numbers = (rows: { number: string }[]) => rows.map((row) => Number(row.number));
        const descending = (values: number[]) => {
            // numbers that are not plain digits (the demo's INV-...) sort last, as 0
            for (let index = 1; index < values.length; index++) {
                expect(values[index] <= values[index - 1] || Number.isNaN(values[index])).toBe(
                    true
                );
            }
        };

        descending(numbers(first.resource));
        expect(first.resource[0]).toHaveProperty('total');

        // A few pages, not all of them: with 50 000 invoices there are 5000 pages of 10. The first
        // three show the order carries over from one page to the next, the last one the end.
        const sampled = [...new Set([1, 2, 3, first.meta.total])].filter(
            (number) => number >= 1 && number <= first.meta.total
        );
        const rows: { id: number; number: string }[] = [];
        const start: { id: number; number: string }[] = [];

        for (const number of sampled) {
            const body = await page(number);

            expect(body.success, `page ${number}`).toBe(true);
            expect(body.resource.length, `page ${number} has rows`).toBeGreaterThan(0);
            rows.push(...body.resource);

            if (number <= 3) start.push(...body.resource);
        }

        descending(numbers(start));
        expect(new Set(rows.map((row) => row.id)).size, 'no invoice is listed twice').toBe(
            rows.length
        );

        // there is nothing after the last page
        expect((await page(first.meta.total + 1)).resource).toHaveLength(0);
    });

    test('pages through the invoices of one customer, newest first, with the line count of each', async () => {
        const customer = await createCustomer(`Pager ${unique}`);
        const product = await createProduct(`PGR-${unique}`);
        const ids: number[] = [];

        for (const quantities of [[1], [1, 2], [1, 2, 3]]) {
            const created = await call('post', '/invoice', {
                customerId: customer,
                items: quantities.map((quantity) => ({ productId: product, quantity })),
            });

            expect(created.success).toBe(true);
            ids.push(created.lastId);
        }

        const page = async (number: number) =>
            call('get', `/invoices?customer=${customer}&page=${number}&limit=2`);

        const one = await page(1);
        const two = await page(2);

        // the newest first, two to a page; `total` is the number of lines
        expect(one.resource.map((row: { id: number }) => row.id)).toEqual([ids[2], ids[1]]);
        expect(one.resource.map((row: { total: number }) => row.total)).toEqual([3, 2]);
        expect(two.resource.map((row: { id: number }) => row.id)).toEqual([ids[0]]);
        expect(two.resource[0]).toMatchObject({ total: 1, name: `Pager ${unique}` });
        expect(one.meta.total, 'pages').toBe(2);
        expect((await page(3)).resource).toHaveLength(0);
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
