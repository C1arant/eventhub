// Production entry point. Wraps the adapter-node handler in a plain node:http server so that
// plain-http access (http://localhost:3000/setup) works: adapter-node 6 ignores a runtime ORIGIN
// and assumes https unless PROTOCOL_HEADER says otherwise, which would 403 every form POST.
import { createServer } from 'node:http';

// The adapter reads these at import time, so default them before importing it.
process.env.PROTOCOL_HEADER ||= 'x-forwarded-proto';
const { handler } = await import('./build/handler.js');

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const protocolHeader = process.env.PROTOCOL_HEADER.toLowerCase();
const addressHeader = (process.env.ADDRESS_HEADER ?? '').toLowerCase();
const hostHeader = (process.env.HOST_HEADER ?? '').toLowerCase();

const server = createServer((req, res) => {
	// A tunnel/proxy sets these. Direct access (localhost) does not, so fill in sane defaults.
	if (!req.headers[protocolHeader]) req.headers[protocolHeader] = 'http';
	if (hostHeader && !req.headers[hostHeader] && req.headers.host) req.headers[hostHeader] = req.headers.host;
	if (addressHeader && !req.headers[addressHeader]) req.headers[addressHeader] = req.socket.remoteAddress ?? '';
	handler(req, res, () => {
		res.statusCode = 404;
		res.end('Not found');
	});
});

server.listen(port, host, () => console.log(`EventHub listening on http://${host}:${port}`));

function shutdown() {
	server.close(() => process.exit(0));
	server.closeIdleConnections?.();
	// SSE streams keep connections open; don't wait forever.
	setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
