import http from 'node:http';
import { childLogger } from '../logger.js';

const log = childLogger({ mod: 'http' });

export type HealthDeps = {
  /** True only when the bot can actually do its job (DB reachable + WhatsApp connected). */
  isReady: () => boolean;
};

export type HealthServer = {
  port: number;
  close: () => void;
};

/**
 * Koyeb probes: /healthz is the liveness endpoint (process alive, never depends
 * on WhatsApp), /readyz gates traffic on real readiness.
 */
export function startHealthServer(deps: HealthDeps, port: number): Promise<HealthServer> {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    res.setHeader('content-type', 'application/json');
    if (url === '/healthz') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (url === '/readyz') {
      const ready = deps.isReady();
      res.writeHead(ready ? 200 : 503);
      res.end(JSON.stringify({ ready }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      log.info({ port }, 'health server listening');
      resolve({
        port,
        close: () => server.close(),
      });
    });
  });
}
