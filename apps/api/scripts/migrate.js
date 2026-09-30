const { execSync } = require("child_process");
const dotenv = require("dotenv");
const { dbConfig } = require("../config/dbConfig");

dotenv.config();

const isDev = process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
const action = process.argv[2] || "up";
const dbs = Object.entries(dbConfig).map((item) => item[1][isDev ? "dev" : "prod"]);

console.log(`🚀 Running '${action}' on: ${dbs.join(", ")}`);

dbs.forEach((dbName) => {
    console.log(`\n--- Processing Database: ${dbName} ---`);
    try {
        const cmd = `npx db-migrate ${action} --config config/database.js`;

        execSync(cmd, {
            stdio: "inherit",
            env: {
                ...process.env,
                DB_NAME: dbName
            }
        });
    } catch (error) {
        console.error(`❌ Failed on ${dbName}`);
        process.exit(1);
    }
});

console.log(`\n✅ Finished all migrations.`);
