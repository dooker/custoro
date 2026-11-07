// The public address of the web app, as set in APP_ORIGIN. Links in emails are built from it,
// never from a request header, because anyone can send any header. Without it (local
// development) the app runs on port 3000.
export const getAppOrigin = (env: Record<string, string | undefined> = process.env) =>
    (env.APP_ORIGIN?.trim() || "http://localhost:3000").replace(/\/+$/, "");

// Any port on localhost is a developer's browser (the web app on 3000, Vite on another port, a
// Playwright run). Production serves one app, so there only APP_ORIGIN may read the answers.
const localhostOrigin = /^http:\/\/localhost(:\d+)?$/;

/**
 * Whether a browser at `origin` may read the API's answers (CORS). No Origin header means no
 * browser or a same-origin GET. Another origin is not an error: it just gets no CORS headers.
 */
export const isAllowedOrigin = (
    origin: string | undefined,
    appOrigin: string,
    production: boolean
): boolean => !origin || origin === appOrigin || (!production && localhostOrigin.test(origin));
