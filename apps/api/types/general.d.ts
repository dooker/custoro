import { Request } from "express";

export interface GetGeneralMultipleIF {
    request: Request;
    sql: string;
    params: (string | number)[];
    totalSql: string;
    type: string;
}

export interface PostGeneralSingleIF {
    sql: string;
    params: (string | number | null)[];
    logger: string;
    database: string;
}

export interface GetConfigIF {
    database: string;
    // The company whose settings these are; the password email has no logged-in caller, so the
    // company is given, not read from a request
    tenantId: number;
    fields: string[];
    mapper: string[];
}

export interface ReplaceVariablesIF {
    content: string;
    replacements: Record<string, string>;
}
