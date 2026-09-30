import mysql from "mysql2/promise";

const pools: Record<string, mysql.Pool> = {};

export const getPool = (database: string) => {
    if (!database) {
        throw new Error("Database name is required for pool creation");
    }

    if (!pools[database]) {
        pools[database] = mysql.createPool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || "3306", 10),
            user: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            multipleStatements: true,
            dateStrings: true
        });

        console.log(`Created new pool for DB: ${database}`);
    }

    return pools[database];
};
