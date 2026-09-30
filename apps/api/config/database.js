const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

dotenv.config();
const envType = process.env.NODE_ENV || "development";
const envPath = path.resolve(process.cwd(), `.env.${envType}`);

if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
}

const dbConfig = {
    driver: "mysql",
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "mysql",
    multipleStatements: true,
    ssl: envType === "production" ? { rejectUnauthorized: false } : false
};

module.exports = {
    development: dbConfig,
    production: dbConfig
};
