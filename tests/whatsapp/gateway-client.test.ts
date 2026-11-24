import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayClient } from '../../src/whatsapp/gateway-client.js';

let socketPath: string;
let server: ReturnType<typeof createServer>;
import type { Socket as NetSocket } from 'node:net';
let serverSockets: NetSocket[] = [];
let received: string[] = [];

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'gw-test-'));
  socketPath = join(dir, 'gw.sock');
  received = [];
  server = createServer((s) => {
    serverSockets.push(s);
    s.setEncoding('utf8');
    s.on('data', (d: string) => {
      for (const line of d.split('\n')) {
        if (line.trim()) received.push(line);
      }
    });
  });
  return () => undefined;
});

afterEach(async () => {
  // Destroy sockets FIRST: server.close() waits for them, and a still
  // reconnecting client would otherwise hang the hook.
  for (const s of serverSockets) s.destroy();
  serverSockets = [];
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(join(socketPath, '..'), { recursive: true, force: true });
});

function startServer(): Promise<void> {
  return new Promise((resolve) => server.listen(socketPath, () => resolve()));
}

/** Push a line from the fake gateway to the client. */
function push(line: string | Record<string, unknown>): void {
  const raw = typeof line === 'string' ? line : JSON.stringify(line);
  for (const s of serverSockets) s.write(`${raw}\n`);
}

describe('GatewayClient over a real Unix socket', () => {
  it('handshakes with hello and surfaces hello_ack as connected', async () => {
    await startServer();
    const client = new GatewayClient(socketPath);
    const connected: string[] = [];
    client.on('connected', () => connected.push('connected'));
    client.start();
    await waitFor(() => received.length >= 1);
    expect(JSON.parse(received[0] as string)).toEqual({ t: 'hello', consumer: 'bot-prime' });
    push({ t: 'hello_ack', ok: true });
    await waitFor(() => connected.length === 1);
    expect(client.isConnected).toBe(true);
    client.stop();
  });

  it('emits message events for msg lines', async () => {
    await startServer();
    const client = new GatewayClient(socketPath);
    const msgs: unknown[] = [];
    client.on('message', (m) => msgs.push(m));
    client.start();
    await waitFor(() => received.length >= 1);
    push({ t: 'hello_ack', ok: true });
    push({
      t: 'msg',
      id: 'm1',
      ts: 1730000000000,
      from: '120363000999@g.us',
      sender: '6281@s.whatsapp.net',
      isGroup: true,
      fromMe: false,
      text: 'gas spar',
    });
    await waitFor(() => msgs.length === 1);
    expect((msgs[0] as { text?: string }).text).toBe('gas spar');
    expect((msgs[0] as { from?: string }).from).toBe('120363000999@g.us');
    client.stop();
  });

  it('sends text and resolves the ack with the message id', async () => {
    await startServer();
    const client = new GatewayClient(socketPath);
    client.start();
    await waitFor(() => received.length >= 1);
    push({ t: 'hello_ack', ok: true });
    const sent = client.sendText('6281@s.whatsapp.net', 'halo via gateway', 100);
    await waitFor(() => received.some((l) => l.includes('"send"')));
    const sendReq = JSON.parse(received.find((l) => l.includes('"send"')) as string) as {
      t: string;
      rid: string;
      to: string;
      text: string;
      typingMs?: number;
    };
    expect(sendReq.to).toBe('6281@s.whatsapp.net');
    expect(sendReq.text).toBe('halo via gateway');
    push({ t: 'ack', rid: sendReq.rid, ok: true, id: 'SENT1', ts: 1 });
    const ack = await sent;
    expect(ack.id).toBe('SENT1');
    client.stop();
  });

  it('rejects a send when the gateway reports failure', async () => {
    await startServer();
    const client = new GatewayClient(socketPath);
    client.start();
    await waitFor(() => received.length >= 1);
    push({ t: 'hello_ack', ok: true });
    const sent = client.sendText('x@s.whatsapp.net', 'y', undefined);
    await waitFor(() => received.some((l) => l.includes('"send"')));
    const sendReq = JSON.parse(received.find((l) => l.includes('"send"')) as string) as { rid: string };
    push({ t: 'ack', rid: sendReq.rid, ok: false, err: 'wa not connected' });
    await expect(sent).rejects.toThrow('wa not connected');
    client.stop();
  });

  it('rejects the handshake on duplicate consumer', async () => {
    await startServer();
    const client = new GatewayClient(socketPath);
    const closed: string[] = [];
    client.on('closed', () => closed.push('closed'));
    client.start();
    await waitFor(() => received.length >= 1);
    push({ t: 'hello_ack', ok: false, err: 'duplicate consumer id' });
    // The dial promise fails; client will retry with backoff — verify at
    // least that it never reports connected.
    await sleep(300);
    expect(client.isConnected).toBe(false);
    client.stop();
  });
});

function waitFor(cond: () => boolean, timeoutMs = 2_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = (): void => {
      if (cond()) return resolve();
      if (Date.now() - t0 > timeoutMs) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

