// Settings the API refuses to run with, without Express, so they can be unit tested.
// index.ts calls these once the .env files are loaded.

import { minMailKeyLength } from "./mailSecret";

// 32 characters is what `openssl rand -hex 32` gives a hex string of 256 bits; a shorter secret
// lets a leaked login token be guessed offline
export const minJwtSecretLength = 32;

/** Why the login token secret is unusable in production, or null when it is fine. */
export const jwtSecretProblem = (secret: string | undefined, production: boolean) => {
    if (!production) return null;

    if (!secret) {
        return "JWT_SECRET is not set. Generate one with: openssl rand -hex 32";
    }

    if (secret.length < minJwtSecretLength) {
        return `JWT_SECRET is too short (${secret.length} characters, at least ${minJwtSecretLength} needed). Generate one with: openssl rand -hex 32`;
    }

    return null;
};

/**
 * A warning when production runs without TRUST_PROXY, or null. Unset, Express trusts every
 * private-network hop, so a client on a private network (an office LAN, a VPN) can put any
 * address in X-Forwarded-For and the login and reset limits count that instead of its own.
 */
export const trustProxyWarning = (value: string | undefined, production: boolean) =>
    production && !value
        ? "TRUST_PROXY is not set: every private-network hop is trusted, so a client on a private network can forge its address and sidestep the per-address login limits. Set it to the number of proxies in front of the API (1 = nginx only, 2 = a TLS proxy and nginx)."
        : null;

/**
 * Why MAIL_SETTINGS_KEY is unusable, or null. Unset is allowed (see mailKeyWarning); set but too
 * short is a mistake that would leave the mail password unencrypted without anyone noticing.
 */
export const mailKeyProblem = (key: string | undefined) =>
    key?.trim() && key.trim().length < minMailKeyLength
        ? `MAIL_SETTINGS_KEY is too short (${key.trim().length} characters, at least ${minMailKeyLength} needed). Generate one with: openssl rand -hex 32`
        : null;

/** A warning when production stores the mail server password without encryption, or null */
export const mailKeyWarning = (key: string | undefined, production: boolean) =>
    production && !key?.trim()
        ? "MAIL_SETTINGS_KEY is not set: the mail server password saved on the settings page is stored as plain text in the storage folder and its backups. Set it (openssl rand -hex 32) and restart; a saved password is then encrypted."
        : null;
