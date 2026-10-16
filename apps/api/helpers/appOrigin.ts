// The public address of the web app, as set in APP_ORIGIN. Links in emails are built from it,
// never from a request header, because anyone can send any header. Without it (local
// development) the app runs on port 3000.
export const getAppOrigin = (env: Record<string, string | undefined> = process.env) =>
    (env.APP_ORIGIN?.trim() || "http://localhost:3000").replace(/\/+$/, "");
