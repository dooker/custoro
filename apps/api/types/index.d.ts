import nodemailer from "nodemailer";

type AttachmentsType = nodemailer.SendMailOptions["attachments"];

export interface ConfigIF {
    name: string;
    schemas: {
        user: string;
    };
    routes: string[];
    itemsPerPage: number;
    database: string;
}

export interface QueryIF {
    database: string;
    sql: string;
    params?: (string | number | boolean)[];
    logger?: string;
    forceLogger?: boolean;
}

export type TotalRow = { total: number };
