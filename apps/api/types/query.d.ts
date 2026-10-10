export type QueryResult<T> = {
    success: boolean;
    data?: T[];
    message?: string;
    insertId?: number | null;
    // Rows matched by an UPDATE or DELETE
    affectedRows?: number;
    // MySQL error code when the query failed, e.g. ER_DUP_ENTRY
    code?: string;
};
