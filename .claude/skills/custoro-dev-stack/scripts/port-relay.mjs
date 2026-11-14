// Forward localhost ports inside a test container to the dev stack's services.
import net from 'node:net';

const routes = { 3000: 'web', 3999: 'api', 8025: 'mail' };
for (const [port, host] of Object.entries(routes)) {
    net.createServer((client) => {
        const upstream = net.connect(Number(port), host);
        client.pipe(upstream).pipe(client);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
    }).listen(Number(port), '127.0.0.1');
}
console.log('relay up');
