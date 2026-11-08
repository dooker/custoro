import path from "node:path";

// Directories the API writes to at runtime. Both live outside the image and are
// volumes in production (see docker-compose.prod.yml).
const root = process.cwd();

/** Public: served as-is at /uploads (avatars, logos). Anything written here is world-readable. */
export const uploadDir = path.join(root, "uploads");

/** Private: generated invoice PDFs. Never served statically, only through GET /pdf/:hash. */
export const pdfDir = path.join(root, "storage", "pdf");

/**
 * Private: the mail server settings saved on the admin settings page (helpers/mailSettings.ts).
 * In the storage volume, so they survive a new container and are in every backup.
 */
export const mailSettingsFile = path.join(root, "storage", "mail-settings.json");

/**
 * Read-only: the fonts of the invoice PDF, part of the image (assets/fonts/README.md). Never
 * downloaded at runtime, so a server without a route to the internet still makes PDFs.
 */
export const fontDir = path.join(root, "assets", "fonts");

/** Where the mail settings were written before: in no volume. Read until they are saved again. */
export const legacyEmailEnvFile = path.join(root, ".env.email");
