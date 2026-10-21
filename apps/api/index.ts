const development = "development";
const env = process.env.NODE_ENV || development;

import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { scrubSentryEvent, tracesSampleRate } from "./helpers/sentryScrub";

// Error tracking is enabled only when SENTRY_DSN is set in the environment
if (process.env.SENTRY_DSN) {
    // Traces and profiles are all kept in development and a tenth in production
    const sampleRate = tracesSampleRate(env, process.env.SENTRY_TRACES_SAMPLE_RATE);

    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: env,
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
import setupCustoroRoutes from "./config/importer";
import pkg from "./package.json";
import { dbConfig } from "./config/dbConfig";
import { config } from "./config/config";
import { getAppOrigin } from "./helpers/appOrigin";
import { errorHandler } from "./helpers/errorResponse";
import { jwtSecretProblem, trustProxyWarning } from "./helpers/startupChecks";
import { uploadDir, pdfDir } from "./config/paths";
import type { Request, Response, NextFunction } from "express";

const { version } = pkg;
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

console.log(`System: Running in ${env} mode`);
console.log(`Root Path: ${rootPath}`);
console.log(`${version} @ ${env}`);

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

app.use(
    cors({
        origin: (origin, callback) => {
            const localhostRegex = /^http:\/\/localhost(:\d+)?$/;

            // No Origin header: not a browser, or a same-origin GET. Anything else must be the
            // app itself. Another origin just gets no CORS headers, so the browser blocks it;
            // the request is not an error.
            const allowed = !origin || localhostRegex.test(origin) || origin === getAppOrigin();

            callback(null, allowed);
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
        version: version,
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

app.use("/login", login);

setupCustoroRoutes(app);

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

// --- Sentry Error Handler ---
// Must be registered after all controllers/routes, but before custom error middleware
Sentry.setupExpressErrorHandler(app);

// Custom Error handler
app.use(errorHandler);

app.listen(servicePort, () => {
    console.log(`Server listening on port ${servicePort}`);
});
