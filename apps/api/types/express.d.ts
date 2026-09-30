import type { JwtPayload } from "jsonwebtoken";

export interface AuthPayload extends JwtPayload {
    id: number;
}

declare module "express-serve-static-core" {
    interface Request {
        user?: AuthPayload | string;
        database: string;
        itemsPerPage?: number;
        query: {
            page?: number;
            order?: string | null;
            direction?: string | null;
            limit?: number;
            [key: string]: string | number | null | undefined;
        };
    }
}

export interface UploadFileIF {
    filename: string;
    path: string;
    mimetype: string;
    size: number;
}

export interface FrontRequestIF {
    body: Record<string, string>;
    file?: UploadFileIF;
    database: string;
}

export interface SqlError {
    code?: string;
    errno?: number;
    sqlMessage?: string;
    sqlState?: string;
    message?: string;
}

export {};
