# Skeletons

Copied from the code that exists. Change the names; keep the structure. The blocks follow the repo's prettier settings (API: double quotes, no trailing commas; web: single quotes, ES5 trailing commas; both 4 spaces), not the default ones, so they are excluded from formatting here.

## Service unit test (`apps/api/services/<name>.test.ts`)

From `services/references.test.ts`: the database module and `query` are replaced, so no database runs.

<!-- prettier-ignore -->
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

const queryMock = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));

const thing = await import("./thing");

const failing = (code: string) =>
    queryMock.mockResolvedValue({ success: false, data: [], code, message: "error" });

const request = (parts: { params?: object; body?: object }) =>
    ({ database: "shop", params: {}, body: {}, ...parts }) as unknown as Request;

beforeEach(() => {
    queryMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("things", () => {
    it("tells a duplicate apart from other failures", async () => {
        failing("ER_DUP_ENTRY");

        const response = await thing.postSingle(request({ body: { code: "T-1", name: "Cable" } }));

        expect(response).toEqual({ success: false, message: "thing.exists" });
    });

    it("refuses a body that is not the right shape, without touching the database", async () => {
        const body = { code: ["x"], name: { a: 1 } };

        expect(await thing.postSingle(request({ body }))).toEqual({
            success: false,
            message: "invalidInput"
        });
        expect(queryMock).not.toHaveBeenCalled();
    });
});
```

For code that uses `withTransaction`, use `createFakeDb()` from `helper/testing/fakeDb.ts` and mock `../db` with `getPool: () => fakeDb.pool`; its `statements(/regex/)` lists the SQL that ran, in order.

## Playwright api spec (`apps/web/tests/<topic>.api.spec.ts`)

From `database.api.spec.ts` and `authorization.api.spec.ts`. A test title must not contain a variable (such as `unique`): the runner looks the title up again in the worker process and a changed title fails with "Test not found in the worker process".

<!-- prettier-ignore -->
```ts
import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';
import { getRegularUser } from './helpers/login';

// Creates data in the target database: run against the dev stack or a scratch database
test.describe.configure({ mode: 'serial' });

const unique = Date.now().toString(36);

let request: APIRequestContext;
let headers: ReturnType<typeof apiHeaders>;
let regularHeaders: ReturnType<typeof apiHeaders>;

test.beforeAll(async ({ playwright }) => {
    request = await playwright.request.newContext();
    headers = apiHeaders(await getApiToken(request));
    regularHeaders = apiHeaders(await getApiToken(request, getRegularUser()));
});

test.afterAll(async () => {
    await request.dispose();
});

const call = async (method: 'get' | 'post' | 'put' | 'delete', path: string, data?: object) =>
    (await request[method](`${apiUrl}${path}`, { headers, ...(data ? { data } : {}) })).json();

test('needs a token', async () => {
    const response = await request.get(`${apiUrl}/things/`, { headers: apiHeaders() });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ success: false, message: 'auth.header' });
});

test('is admin only', async () => {
    const response = await request.get(`${apiUrl}/things/`, { headers: regularHeaders });

    expect(await response.json()).toEqual({ success: false, message: 'forbidden' });
});

test('an id that is not a plain number finds nothing', async () => {
    for (const id of ['1%20OR%201=1', '1e3', '0']) {
        expect(await call('get', `/thing/${id}`)).toEqual({ success: false, message: 'error' });
    }
});

test('refuses a value of the wrong kind', async () => {
    expect(await call('post', '/thing', { name: { a: 1 } })).toEqual({
        success: false,
        message: 'invalidInput',
    });
});

test('creates and reads a thing', async () => {
    const created = await call('post', '/thing', { code: `T-${unique}`, name: 'Cable' });

    expect(created.success).toBe(true);
    expect((await call('get', `/thing/${created.insertId}`)).data[0].name).toBe('Cable');
});
```

Run with `cd apps/web && npx playwright test --project=api --workers=1 <file>` (stack and `apps/web/.env` as in the dev-stack skill).
