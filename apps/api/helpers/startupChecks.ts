// Settings the API refuses to run with, without Express, so they can be unit tested.
// index.ts calls these once the .env files are loaded.

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
