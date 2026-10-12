import { query } from "../helper/query";

// Usernames are the login emails and must be unique. The column compares case-insensitively,
// so "Ann@x.example" counts as taken when "ann@x.example" exists. The unique index on
// users.username backs this up when two requests race.
export const isUsernameTaken = async (database: string, username: string, exceptId?: number) => {
    const { success, data } = await query<{ count: number }>({
        database,
        sql: `SELECT COUNT(id) AS count
              FROM users
              WHERE username = ?
                AND id <> ?;`,
        params: [username, exceptId ?? 0],
        logger: "Check if username is taken"
    });

    // A failed check counts as taken, so a database error never lets a duplicate through
    return !success || Number(data?.[0]?.count) > 0;
};
