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
    params: (string | number)[];
    logger: string;
    database: string;
}

export interface GetConfigIF {
    database: string;
    fields: string[];
    mapper: string[];
}

export interface ReplaceVariablesIF {
    content: string;
    replacements: Record<string, string>;
}
