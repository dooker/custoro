import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The production headers live in nginx files, not in code. These tests read them so a change that
// loosens the policy or drops a header fails here, before anyone has to find it in a browser.
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

const appHeaders = read('../nginx/app-headers.conf');
const serverConfig = read('../nginx.conf');

const contentSecurityPolicy = (() => {
    const match = appHeaders.match(/add_header Content-Security-Policy "([^"]+)"/);

    if (!match) throw new Error('app-headers.conf sets no Content-Security-Policy');

    return Object.fromEntries(
        match[1].split(';').map((directive) => {
            const [name, ...sources] = directive.trim().split(/\s+/);

            return [name, sources];
        })
    ) as Record<string, string[]>;
})();

// The text of one `location <path> { ... }` block
const location = (path: string): string => {
    const start = serverConfig.indexOf(`location ${path} {`);

    if (start < 0) throw new Error(`nginx.conf has no location ${path}`);

    return serverConfig.slice(start, serverConfig.indexOf('\n    }', start));
};

describe('Content-Security-Policy of the app', () => {
    // The login token is in localStorage, so script that is not the app's own must not run
    it('runs script from the app only: no inline script, no eval, no other host', () => {
        expect(contentSecurityPolicy['script-src']).toEqual(["'self'"]);
        expect(contentSecurityPolicy['default-src']).toEqual(["'self'"]);
    });

    it('allows no unsafe-eval and no unsafe-inline for script anywhere', () => {
        for (const [name, sources] of Object.entries(contentSecurityPolicy)) {
            expect(sources, name).not.toContain("'unsafe-eval'");

            if (name.startsWith('script-src')) {
                expect(sources, name).not.toContain("'unsafe-inline'");
            }
        }
    });

    it('shuts the doors a script-less attack would use', () => {
        expect(contentSecurityPolicy['object-src']).toEqual(["'none'"]);
        expect(contentSecurityPolicy['base-uri']).toEqual(["'self'"]);
        expect(contentSecurityPolicy['form-action']).toEqual(["'self'"]);
        expect(contentSecurityPolicy['frame-ancestors']).toEqual(["'self'"]);
    });

    it('lets the app talk to itself and Sentry only', () => {
        expect(contentSecurityPolicy['connect-src']).toEqual(["'self'", 'https://*.sentry.io']);
    });
});

describe('caching of the app', () => {
    // The page names the fingerprinted files of one build. Cached for a while, it would point at
    // files the next deploy removed and show a blank page until a hard reload.
    it('makes the browser check the page and the unfingerprinted files before using them', () => {
        expect(location('/')).toMatch(/add_header Cache-Control "no-cache"/);
    });

    it('keeps fingerprinted build files for a year', () => {
        expect(location('/assets/')).toMatch(/expires 1y/);
        expect(location('/assets/')).toMatch(/Cache-Control "public, immutable"/);
    });
});
