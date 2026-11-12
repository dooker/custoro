const development = "development";
const env = process.env.NODE_ENV || development;

import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { scrubSentryEvent, tracesSampleRate } from "./helpers/sentryScrub";
import { getBuildInfo } from "./helpers/buildInfo";
import pkg from "./package.json";

// The version, and the commit the image was built from (scripts/docker-build.sh)
const buildInfo = getBuildInfo(pkg.version);

// Error tracking is enabled only when SENTRY_DSN is set in the environment
if (process.env.SENTRY_DSN) {
    // Traces and profiles are all kept in development and a tenth in production
    const sampleRate = tracesSampleRate(env, process.env.SENTRY_TRACES_SAMPLE_RATE);

    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: env,
        // Errors are grouped by the build they happened in
        release: buildInfo.release,
        integrations: [nodeProfilingIntegration()],
        tracesSampleRate: sampleRate,
        profileSessionSampleRate: sampleRate,
        profileLifecycle: "trace",
        // Request bodies, the Authorization header and PDF links (the hash in /pdf/<hash> is the
        // invoice's only credential) never leave the server, in errors and in traces
        beforeSend: (event) => scrubSentryEvent(event),
        beforeSendTransaction: (event) => scrubSentryEvent(event)
    });
}

import dotenv from "dotenv";
// Express 5 forwards rejected promises from async handlers to the error middleware below.
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import login from "./routes/login";
import { webApp } from "./routes/webApp";
import setupCustoroRoutes from "./config/importer";
import { dbConfig } from "./config/dbConfig";
import { config } from "./config/config";
import { getAppOrigin, isAllowedOrigin } from "./helpers/appOrigin";
import { errorHandler } from "./helpers/errorResponse";
import {
    jwtSecretProblem,
    mailKeyProblem,
    mailKeyWarning,
    serviceHost,
    trustProxyWarning
} from "./helpers/startupChecks";
import { encryptSavedMailPassword } from "./services/settings";
import { createShutdown, shutdownSignals } from "./helpers/shutdown";
import { closePools } from "./db";
import { uploadDir, pdfDir } from "./config/paths";
import type { Request, Response, NextFunction } from "express";

const rootPath = process.cwd();
const envFile = env === "production" ? ".env.production" : ".env.development";

// Precedence: real environment (e.g. Docker) > .env.<env> > .env
// quiet: dotenv 17+ otherwise logs an "injected env" line on every start
dotenv.config({ path: path.join(rootPath, envFile), quiet: true });
dotenv.config({ path: path.join(rootPath, ".env"), quiet: true });

const jwtProblem = jwtSecretProblem(process.env.JWT_SECRET, env === "production");

if (jwtProblem) {
    console.error(`Refusing to start: ${jwtProblem}`);
    process.exit(1);
}

const proxyWarning = trustProxyWarning(process.env.TRUST_PROXY, env === "production");

if (proxyWarning) {
    console.warn(`Warning: ${proxyWarning}`);
}

const mailProblem = mailKeyProblem(process.env.MAIL_SETTINGS_KEY);

if (mailProblem) {
    console.error(`Refusing to start: ${mailProblem}`);
    process.exit(1);
}

const mailWarning = mailKeyWarning(process.env.MAIL_SETTINGS_KEY, env === "production");

if (mailWarning) {
    console.warn(`Warning: ${mailWarning}`);
}

// A password saved before the key was set is encrypted now
encryptSavedMailPassword();

console.log(`System: Running in ${env} mode`);
console.log(`Root Path: ${rootPath}`);
console.log(`${buildInfo.release} @ ${env}`);

const app = express();
const servicePort = process.env.SERVICE_PORT || 3999;

// req.ip feeds the login and reset limits. Behind nginx (and maybe a TLS proxy) the client
// address is in X-Forwarded-For. TRUST_PROXY takes Express's "trust proxy" values: a hop count
// (the right choice in production: only the proxies you run are believed, so a forged header
// cannot move the address), true/false or a list. Unset it trusts private-network hops, which
// suits development (the tests log in from several made-up addresses) but not a client on a
// private network in production, who could then forge its address; production warns about it.
const parseTrustProxy = (value: string | undefined) => {
    if (!value) return "loopback, linklocal, uniquelocal";
    if (/^\d+$/.test(value)) return Number(value);
    if (value === "true" || value === "false") return value === "true";

    return value;
};

app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));
app.disable("x-powered-by");

// WEB_DIR: no nginx in front (a web host that forwards the domain to this process, such as
// Zone.ee), so this process serves the web app too, and the API under /api (routes/webApp.ts)
const webDir = process.env.WEB_DIR?.trim();

if (webDir) {
    app.use(webApp(path.resolve(webDir), { hsts: getAppOrigin().startsWith("https://") }));
    console.log(`Serving the web app from ${path.resolve(webDir)}`);
}

app.use(
    cors({
        origin: (origin, callback) => {
            callback(null, isAllowedOrigin(origin, getAppOrigin(), env === "production"));
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "apikey",
            "profile",
            "sentry-trace", // Added for Sentry trace propagation
            "baggage" // Added for Sentry trace propagation
        ],
        exposedHeaders: ["Content-Disposition"]
    })
);

// Express 5 path syntax: "{*splat}" also matches the root path
app.options("/{*splat}", cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.json({
        message: "Custoro API",
        version: buildInfo.version,
        build: buildInfo.build,
        builtAt: buildInfo.builtAt,
        environment: env
    });
});

const uploadFolder = "/uploads";

// One app, one database: what the request's Origin says no longer picks anything
app.use((req: Request, _res: Response, next: NextFunction) => {
    req.database = dbConfig.default[env === "production" ? "prod" : "dev"];
    // TODO should be removed
    req.itemsPerPage = config.itemsPerPage;

    next();
});

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(pdfDir, { recursive: true });
// Only the public upload folder is served statically. Invoice PDFs live in pdfDir, outside
// this root, so they cannot be enumerated by invoice number; see routes/pdf.ts.
// Uploads are validated images (helpers/imageUpload.ts); the headers make sure a browser
// never treats one as anything else, and never runs scripts from this path.
app.use(
    uploadFolder,
    express.static(uploadDir, {
        dotfiles: "deny",
        index: false,
        setHeaders: (res) => {
            res.setHeader("X-Content-Type-Options", "nosniff");
            res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
        }
    })
);

// Everything else the API answers is the user's data (customers, invoices, PDFs, settings) or a
// login. no-store keeps it out of the browser's and any proxy's cache, so it cannot be read back
// from a shared computer after logout. The public images above stay cacheable.
app.use((_req: Request, res: Response, next: NextFunction) => {
    res.set("Cache-Control", "no-store");
    next();
});

app.use("/login", login);

setupCustoroRoutes(app);

// --- Sentry Error Handler ---
// Must be registered after all controllers/routes, but before custom error middleware
Sentry.setupExpressErrorHandler(app);

// Custom Error handler
app.use(errorHandler);

// SERVICE_HOST=127.0.0.1 without Docker: only nginx on the same machine reaches the API
const host = serviceHost(process.env.SERVICE_HOST);
const listening = () =>
    console.log(`Server listening on ${host ?? "every address"}, port ${servicePort}`);
const server = host
    ? app.listen(Number(servicePort), host, listening)
    : app.listen(servicePort, listening);

// A stop from Docker or Ctrl+C lets the running requests finish before the process ends
const shutdown = createShutdown({
    server,
    closeResources: async () => {
        await closePools();
        // Sends what error tracking still holds; does nothing when SENTRY_DSN is not set
        await Sentry.close(2000);
    },
    exit: (code) => process.exit(code)
});

shutdownSignals.forEach((signal) => process.on(signal, () => void shutdown(signal)));
