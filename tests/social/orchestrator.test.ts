import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { AIRouter } from '../../src/ai/router.js';
import { listMemories } from '../../src/db/repos/memories.js';
import { insertMessages } from '../../src/db/repos/messages.js';
import { ShortTermStore } from '../../src/memory/short-term.js';
import { SocialOrchestrator } from '../../src/social/orchestrator.js';
import type { AIProvider } from '../../src/ai/types.js';
import type { GenerateRequest } from '../../src/ai/types.js';
import type { NormalizedMessage } from '../../src/whatsapp/normalize.js';

function norm(partial: Partial<NormalizedMessage>): NormalizedMessage {
  return {
    id: randomUUID(),
    chatJid: 'g@lid',
    isGroup: true,
    senderJid: '1@lid',
    isFromMe: false,
    text: '',
    type: 'conversation',
    timestamp: Date.now(),
    ...partial,
  };
}

function okProvider(): AIProvider {
  return {
    name: 'fake',
    model: 'fake-model',
    generate: async () => ({ text: 'gas dah wkwk', provider: 'fake', model: 'fake-model' }),
  };
}

type Deps = ConstructorParameters<typeof SocialOrchestrator>[0];

let sent: Array<{ jid: string; text: string }>;
let stickers: string[];
let deps: Deps;

beforeEach(async () => {
  const db = createDb(':memory:');
  await runMigrations(db);
  sent = [];
  stickers = [];
  deps = {
    db,
    router: new AIRouter([okProvider()]),
    sender: {
      sendText: async (jid, text) => {
        sent.push({ jid, text });
      },
    },
    shortTerm: new ShortTermStore(),
    matchSticker: async (text) => (text.includes('🗿🗿') ? 'moai' : null),
    sendStickerByName: async (_jid, name) => {
      stickers.push(name);
    },
  };
});

describe('SocialOrchestrator', () => {
  it('replies to mentions through the AI path and stores the reply state', async () => {
    const orch = new SocialOrchestrator(deps);
    await orch.handleBurst('g@lid', [norm({ text: 'wok omak gimana?', pushName: 'Arya' })]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.jid).toBe('g@lid');
    expect(sent[0]?.text.length).toBeGreaterThan(0);
  });

  it('stays quiet on non-mentioned bursts (ambient rate gated)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const orch = new SocialOrchestrator(deps);
    await orch.handleBurst('g@lid', [norm({ text: 'wkwkwk kocak' })]);
    expect(sent).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('uses the sticker hook before the AI path', async () => {
    const orch = new SocialOrchestrator(deps);
    await orch.handleBurst('g@lid', [norm({ text: '🗿🗿', pushName: 'Arya' })]);
    expect(stickers).toEqual(['moai']);
    expect(sent).toHaveLength(0);
  });

  it('extracts heuristic memories even when staying quiet', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const orch = new SocialOrchestrator(deps);
    await orch.handleBurst('g@lid', [norm({ text: 'cb uid 123456789 Gas' })]);
    const memories = await listMemories(deps.db, 'g@lid');
    expect(memories.some((m) => m.content.startsWith('UID'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('deflects after repeated rage-bait requests', async () => {
    const quietDeps: Deps = { ...deps, router: null };
    const orch = new SocialOrchestrator(quietDeps);
    for (let i = 0; i < 4; i++) {
      await orch.handleBurst('g@lid', [norm({ text: 'omak hina dia', pushName: 'Arya' })]);
    }
    expect(sent.some((s) => s.text.includes('udah udah'))).toBe(true);
  });

  it('never replies to itself', async () => {
    const orch = new SocialOrchestrator(deps);
    await orch.handleBurst('g@lid', [norm({ text: 'wkwk', isFromMe: true })]);
    expect(sent).toHaveLength(0);
  });

  it('builds prompt history from the durable DB, not just RAM (restart regression)', async () => {
    // The conversation existed BEFORE this process started: rows are already
    // persisted. A fresh orchestrator (empty ShortTermStore) must still see
    // them — the old RAM-only context made every redeploy start blank.
    const base = Date.now() - 60_000;
    await insertMessages(deps.db, [
      { id: 'h1', chatJid: 'g@lid', senderJid: '9@lid', msgType: 'conversation', text: 'spar jam 20.30 ya', isFromMe: false, timestamp: base, pushName: 'Arya' },
      { id: 'h2', chatJid: 'g@lid', senderJid: 'me', msgType: 'conversation', text: 'siap, gue catet', isFromMe: true, timestamp: base + 1000 },
      { id: 'h3', chatJid: 'g@lid', senderJid: '7@lid', msgType: 'conversation', text: 'nolep ml mulu', isFromMe: false, timestamp: base + 2000 },
    ]);
    const systems: string[] = [];
    const captureProvider: AIProvider = {
      name: 'fake',
      model: 'fake-model',
      generate: async (req: GenerateRequest) => {
        systems.push(req.system);
        return { text: 'gas dah wkwk', provider: 'fake', model: 'fake-model' };
      },
    };
    const freshDeps: Deps = { ...deps, router: new AIRouter([captureProvider]) };
    const orch = new SocialOrchestrator(freshDeps); // fresh = empty RAM store
    const burstMsg = norm({ text: 'wok omak siapa tadi yang ngajak spar?', pushName: 'Ciboy' });
    await orch.handleBurst('g@lid', [burstMsg]);
    expect(systems).toHaveLength(1);
    const system = systems[0] ?? '';
    // Persisted history made it into the prompt with real display names…
    expect(system).toContain('Arya: spar jam 20.30 ya');
    expect(system).toContain('omak: siap, gue catet');
    // …and the current burst is rendered as the new incoming message, not duplicated.
    expect(system).toContain('Ciboy: wok omak siapa tadi yang ngajak spar?');
    expect(system.match(/spar jam 20\.30 ya/g)).toHaveLength(1);
  });
});
