import http from 'node:http';
import { env } from './config/env.js';
import { childLogger } from './logger.js';

const log = childLogger({ mod: 'bootstrap' });

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  if (url === '/healthz') {
    // Scaffold-stage placeholder: the real stateful health module replaces this.
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'starting', phase: 'scaffold' }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

function shutdown(signal: string): void {
  log.info({ signal }, 'shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

server.listen(env.PORT, () => {
  log.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, 'omak scaffold up');
});
