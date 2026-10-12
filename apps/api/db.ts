import mysql from "mysql2/promise";
import { getDbSsl } from "./config/dbSsl";

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
            dateStrings: true,
            // Plain by default (the database sits on a private Docker network); set DB_SSL=verify
            // when it is reached over a network you do not control, see config/dbSsl.js
            ssl: getDbSsl("off")
        });

        console.log(`Created new pool for DB: ${database}`);
    }

    return pools[database];
};
