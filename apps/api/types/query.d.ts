export type QueryResult<T> = {
    success: boolean;
    data?: T[];
    message?: string;
    insertId?: number | null;
};
