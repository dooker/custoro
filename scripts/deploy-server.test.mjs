// deploy/server/custoro.sh: the address its health check, status and rollback ask the API at.
// The script is sourced (it runs no command then) with its .env.production reader replaced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../deploy/server/custoro.sh', import.meta.url));

const apiUrl = (runner, host, port = '3999') =>
    execFileSync(
        'bash',
        [
            '-c',
            'source "$1"; setting() { case "$2" in SERVICE_HOST) printf %s "$HOST";; SERVICE_PORT) printf %s "$PORT";; esac; }; api_url /api',
            'bash',
            script,
        ],
        { env: { ...process.env, CUSTORO_RUNNER: runner, HOST: host, PORT: port } }
    )
        .toString()
        .trim();

test('pm2: the loopback address and port of .env.production, under /api/', () => {
    assert.equal(apiUrl('pm2', '127.20.30.40', '4123'), 'http://127.20.30.40:4123/api/');
    assert.equal(apiUrl('pm2', '', ''), 'http://127.0.0.1:3999/api/');
});

test('pm2: an IPv6 address is put in brackets, as a URL needs', () => {
    assert.equal(apiUrl('pm2', '::1'), 'http://[::1]:3999/api/');
    assert.equal(apiUrl('pm2', 'fd00::5'), 'http://[fd00::5]:3999/api/');
    assert.equal(apiUrl('pm2', '[::1]'), 'http://[::1]:3999/api/');
});

test('systemd: always 127.0.0.1 (the unit sets it), at the root', () => {
    assert.equal(apiUrl('systemd', '::1'), 'http://127.0.0.1:3999/');
});

test('sourcing the script runs no command', () => {
    const out = execFileSync('bash', ['-c', 'source "$1"; echo sourced', 'bash', script], {
        env: { ...process.env, CUSTORO_RUNNER: 'pm2' },
    }).toString();
    assert.equal(out, 'sourced\n');
});
