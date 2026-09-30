// Single tenant, configured via environment variables.
// Getters so values are read after .env files have been loaded.
export const dbConfig = {
    default: {
        get host() {
            return process.env.APP_ORIGIN || "http://localhost:3000";
        },
        get dev() {
            return process.env.DB_NAME || "custoro";
        },
        get prod() {
            return process.env.DB_NAME || "custoro";
        }
    }
};
