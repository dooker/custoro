import fs from "fs";
import path from "path";
import express from "express";
import type { NextFunction, Request, RequestHandler, Response } from "express";

// Without nginx in front (a web host such as Zone.ee forwards a whole domain to one Node process),
// the API serves the built web app itself, by the rules of apps/web/nginx.conf and its snippets:
// - /api/... is the API, with the prefix removed as nginx removes it (/api/customers -> /customers)
// - /assets/... are the fingerprinted build files, cached for a year; a missing one is a 404
// - any other path is a file of the build, or else index.html (the app's own routes, /invoices/12),
//   never the API: the app's pages and the API's paths share names
// Set WEB_DIR to the built web app (dist) to turn this on; deploy/server/custoro.sh does in its
// PM2 mode.

// The same policy as apps/web/nginx/app-headers.conf (webApp.test.ts compares them); the reasons
// are written there
export const appContentSecurityPolicy =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' https://*.sentry.io; frame-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";

// apps/web/nginx/security-headers.conf: on every answer, the API's included
const setSecurityHeaders = (res: Response, hsts: boolean) => {
    if (hsts) res.setHeader("Strict-Transport-Security", "max-age=31536000");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
};

// apps/web/nginx/app-headers.conf: on the app's own pages and files
const setAppHeaders = (res: Response, cacheControl: string) => {
    res.setHeader("Content-Security-Policy", appContentSecurityPolicy);
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Cache-Control", cacheControl);
};

// index.html names the fingerprinted files of one build, and the unfingerprinted ones (locales,
// CHANGELOG.md) change with it: the browser asks each time and gets a 304 when nothing changed
const revalidate = "no-cache";
const forever = "public, max-age=31536000, immutable";

/**
 * Serves the web app in `webDir` and passes /api/... on to the API's routes. `hsts`: the app is
 * reached over HTTPS (APP_ORIGIN), so browsers may be told to keep to it.
 */
export const webApp = (webDir: string, { hsts }: { hsts: boolean }): RequestHandler => {
    const indexFile = path.join(webDir, "index.html");

    if (!fs.existsSync(indexFile)) {
        throw new Error(`WEB_DIR has no index.html: ${webDir}`);
    }

    const files = express.static(webDir, {
        index: false,
        redirect: false,
        dotfiles: "ignore",
        cacheControl: false,
        setHeaders: (res, file) => {
            const relative = path.relative(webDir, file).split(path.sep).join("/");
            setAppHeaders(res, relative.startsWith("assets/") ? forever : revalidate);
        }
    });

    return (req: Request, res: Response, next: NextFunction) => {
        setSecurityHeaders(res, hsts);

        if (req.url.startsWith("/api/")) {
            req.url = req.url.slice("/api".length);
            next();

            return;
        }

        if (req.method !== "GET" && req.method !== "HEAD") {
            res.setHeader("Allow", "GET, HEAD");
            res.sendStatus(405);

            return;
        }

        files(req, res, () => {
            if (req.path.startsWith("/assets/")) {
                res.sendStatus(404);

                return;
            }

            setAppHeaders(res, revalidate);
            res.sendFile(indexFile, { cacheControl: false }, (err) => {
                if (err && !res.headersSent) res.sendStatus(500);
            });
        });
    };
};
