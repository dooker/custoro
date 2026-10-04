const development = "development";
const env = process.env.NODE_ENV || development;

import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

// Error tracking is enabled only when SENTRY_DSN is set in the environment
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: env,
        integrations: [nodeProfilingIntegration()],
        // Trace 100% of transactions during local development
        tracesSampleRate: 1.0,
        profileSessionSampleRate: 1.0,
        profileLifecycle: "trace"
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
import { getDatabaseName } from "./helper";
import { uploadDir, pdfDir } from "./config/paths";
import type { DBConfigMap } from "./types";
import type { Request, Response, NextFunction } from "express";

const { version } = pkg;
const rootPath = process.cwd();
const envFile = env === "production" ? ".env.production" : ".env.development";
const error500 = "500 - Internal Server Booboo.";

// Precedence: real environment (e.g. Docker) > .env.<env> > .env
// quiet: dotenv 17+ otherwise logs an "injected env" line on every start
dotenv.config({ path: path.join(rootPath, envFile), quiet: true });
dotenv.config({ path: path.join(rootPath, ".env"), quiet: true });

console.log(`System: Running in ${env} mode`);
console.log(`Root Path: ${rootPath}`);
console.log(`${version} @ ${env}`);

const app = express();
const servicePort = process.env.SERVICE_PORT || 3999;

app.use(
    cors({
        origin: (origin, callback) => {
            const localhostRegex = /^http:\/\/localhost(:\d+)?$/;
            const allowedHosts = Object.entries(dbConfig).map(
                (item) => (item as unknown as DBConfigMap)[1].host
            );

            if (origin && localhostRegex.test(origin)) {
                return callback(null, true);
            }

            if (!origin || allowedHosts.includes(origin)) {
                return callback(null, true);
            }

            callback(new Error("Not allowed by CORS"));
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

app.use(async (req: Request, _res: Response, next: NextFunction) => {
    const publicPaths = ["/", "/favicon.ico"];
    const origin = req.headers.origin;
    const isDev = env === development;

    if (publicPaths.includes(req.path) || req.path.startsWith(uploadFolder)) {
        return next();
    }

    // Fallback if origin header is missing (e.g. direct browser hits, curl, postman)
    const effectiveOrigin = origin || (isDev ? "http://localhost:3000" : "");

    req.database = getDatabaseName(dbConfig, String(effectiveOrigin), isDev);
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
app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    console.error("Unhandled error:", error);

    // If a response was already partially sent, let Express close the connection
    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({ message: error500 });
});

app.listen(servicePort, () => {
    console.log(`Server listening on port ${servicePort}`);
});
