import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { uploadDir } from "../config/paths";
import type { Request, Response, NextFunction, RequestHandler } from "express";

// Uploaded images are served back from the app origin, so anything that is not a real
// raster image (an HTML file, an SVG with a script) would be a stored XSS. Only formats
// the browser and @react-pdf (for the invoice logo) can render are accepted.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const extensionByMimeType: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp"
};

class UploadError extends Error {
    constructor(public readonly key: string) {
        super(key);
    }
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    // The stored name never comes from the client: no path tricks, no chosen extension
    filename: (_req, file, cb) =>
        cb(
            null,
            `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extensionByMimeType[file.mimetype]}`
        )
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    fileFilter: (_req, file, cb) =>
        extensionByMimeType[file.mimetype] ? cb(null, true) : cb(new UploadError("uploadType"))
});

// The MIME type above is declared by the client, so check the file really starts like one
export const hasImageSignature = (head: Buffer, mimetype: string) => {
    switch (mimetype) {
        case "image/png":
            return head
                .subarray(0, 8)
                .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        case "image/jpeg":
            return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
        case "image/gif":
            return head.subarray(0, 4).toString("latin1") === "GIF8";
        case "image/webp":
            return (
                head.subarray(0, 4).toString("latin1") === "RIFF" &&
                head.subarray(8, 12).toString("latin1") === "WEBP"
            );
        default:
            return false;
    }
};

const readHead = async (filePath: string) => {
    const handle = await fs.promises.open(filePath, "r");

    try {
        const { bytesRead, buffer } = await handle.read(Buffer.alloc(12), 0, 12, 0);

        return buffer.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
};

const reject = (res: Response, message: string) =>
    // Same shape as every other API error, so the web app shows it as a notification
    res.json({ success: false, message });

/**
 * Accepts one optional image in `field`, or answers with an error notification key.
 * Use in place of `multer().single(field)`.
 */
export const imageUpload = (field: string): RequestHandler[] => [
    (req: Request, res: Response, next: NextFunction) =>
        upload.single(field)(req, res, (error: unknown) => {
            if (!error) {
                return next();
            }

            if (error instanceof UploadError) {
                return reject(res, error.key);
            }

            if (error instanceof multer.MulterError) {
                return reject(
                    res,
                    error.code === "LIMIT_FILE_SIZE" ? "uploadSize" : "uploadFailed"
                );
            }

            next(error);
        }),
    async (req: Request, res: Response, next: NextFunction) => {
        const file = req.file;

        if (!file) {
            return next();
        }

        if (hasImageSignature(await readHead(file.path), file.mimetype)) {
            return next();
        }

        await fs.promises.unlink(path.join(uploadDir, file.filename)).catch(() => undefined);

        return reject(res, "uploadType");
    }
];
