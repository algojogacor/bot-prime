import { childLogger } from '../logger.js';
import type { AIRouter } from '../ai/router.js';
import { buildStarterPrompt, localStarter, shouldStartConversation } from '../social/starter.js';
import { analyzeBurst } from '../social/context-analyzer.js';
import { aiSummarize, heuristicSummary } from '../memory/summarizer.js';
import { runRetention } from '../memory/retention.js';
import { addMemory } from '../db/repos/memories.js';
import { buildMemoryContext } from '../memory/retrieval.js';
import type { Client } from '@libsql/client';
import type { ShortTermStore } from '../memory/short-term.js';
import type { Sender } from '../social/orchestrator.js';

const log = childLogger({ mod: 'scheduler' });

export type ScheduledTask = {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
};

/** Minimal interval scheduler; tasks are unref'd so they never hold the process. */
export class Scheduler {
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly tasks: ScheduledTask[]) {}

  start(): void {
    for (const task of this.tasks) {
      const timer = setInterval(() => {
        void task.run().catch((err) => log.error({ err, task: task.name }, 'task failed'));
      }, task.intervalMs);
      timer.unref?.();
      this.timers.set(task.name, timer);
    }
    log.info({ tasks: this.tasks.map((t) => t.name) }, 'scheduler started');
  }

  stop(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }
}

/** Daily retention: prune old messages + low-importance memories. */
export function retentionTask(db: Client): ScheduledTask {
  return {
    name: 'retention',
    intervalMs: 24 * 3_600_000,
    run: async () => {
      const result = await runRetention(db);
      if (result.messagesDeleted > 0 || result.memoriesDeleted > 0) {
        log.info(result, 'retention pass');
      }
    },
  };
}

/** Hourly: summarize long segments per chat into a 'summary' memory. */
export function summarizerTask(
  db: Client,
  router: AIRouter | null,
  shortTerm: ShortTermStore,
  minNewMessages = 30,
): ScheduledTask {
  const processed = new Map<string, number>();
  return {
    name: 'summarizer',
    intervalMs: 3_600_000,
    run: async () => {
      for (const chatJid of shortTerm.activeChats()) {
        const recent = shortTerm.recent(chatJid, 60);
        const done = processed.get(chatJid) ?? 0;
        if (recent.length - done < minNewMessages) continue;
        const summary =
          router !== null
            ? await aiSummarize(router, recent)
            : heuristicSummary(recent);
        await addMemory(db, { chatJid, kind: 'summary', content: summary, importance: 2 });
        processed.set(chatJid, recent.length);
        log.info({ chatJid }, 'summary stored');
      }
    },
  };
}

/** Every 15 min: maybe drop a conversation starter into a quiet-but-active chat. */
export function starterTask(
  db: Client,
  router: AIRouter | null,
  shortTerm: ShortTermStore,
  sender: Sender,
  maxPerDay: number,
): ScheduledTask {
  const counters = new Map<string, number>();
  const todayKey = () => new Date().toISOString().slice(0, 10);
  return {
    name: 'starter',
    intervalMs: 15 * 60_000,
    run: async () => {
      const hourWib = new Date(Date.now() + 7 * 3_600_000).getUTCHours();
      for (const chatJid of shortTerm.activeChats()) {
        const key = `${todayKey()}:${chatJid}`;
        const used = counters.get(key) ?? 0;
        const minutesSinceLast = shortTerm.minutesSinceLastMessage(chatJid);
        if (!shouldStartConversation({ hourWib, minutesSinceLast, startersToday: used, maxStartersPerDay: maxPerDay })) {
          continue;
        }
        const recent = shortTerm.recent(chatJid, 10);
        const topics = analyzeBurst(recent.map((m) => ({ sender: m.sender, text: m.text }))).topics;
        const memories = (await buildMemoryContext(db, chatJid, topics.join(' ') || 'halo')) ?? '';
        const text =
          router !== null
            ? await router
                .generate({
                  system: buildStarterPrompt(topics, memories ? [memories] : []),
                  messages: [{ role: 'user', content: 'bikin pembuka 1 kalimat' }],
                  maxTokens: 60,
                })
                .then((r) => r.text.trim())
                .catch(() => localStarter(topics))
            : localStarter(topics);
        await sender.sendText(chatJid, text);
        counters.set(key, used + 1);
        log.info({ chatJid }, 'starter sent');
      }
      // Roll over daily counters lazily: clear entries from previous days.
      const today = todayKey();
      for (const key of [...counters.keys()]) {
        if (!key.startsWith(today)) counters.delete(key);
      }
    },
  };
}
