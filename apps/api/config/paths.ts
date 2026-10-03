import path from "node:path";

// Directories the API writes to at runtime. Both live outside the image and are
// volumes in production (see docker-compose.prod.yml).
const root = process.cwd();

/** Public: served as-is at /uploads (avatars, logos). Anything written here is world-readable. */
export const uploadDir = path.join(root, "uploads");

/** Private: generated invoice PDFs. Never served statically, only through GET /pdf/:hash. */
export const pdfDir = path.join(root, "storage", "pdf");
