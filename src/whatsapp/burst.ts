/**
 * Collects messages per chat over a short window so the bot reacts to a
 * burst ("wkwk", "jir", "gas") as ONE context instead of spamming a reply
 * per line. The corpus shows 62.7% of bursts are single messages and 84.7%
 * are 1–2 messages, so a 2–3s window keeps latency natural.
 */
export class BurstCollector<T> {
  private buffers = new Map<string, T[]>();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly windowMs: number,
    private readonly flush: (chatJid: string, items: T[]) => void | Promise<void>,
  ) {}

  push(chatJid: string, item: T): void {
    const buffer = this.buffers.get(chatJid) ?? [];
    buffer.push(item);
    this.buffers.set(chatJid, buffer);
    if (!this.timers.has(chatJid)) {
      const timer = setTimeout(() => {
        this.timers.delete(chatJid);
        void this.drain(chatJid);
      }, this.windowMs);
      timer.unref?.();
      this.timers.set(chatJid, timer);
    }
  }

  private async drain(chatJid: string): Promise<void> {
    const items = this.buffers.get(chatJid);
    this.buffers.delete(chatJid);
    if (items && items.length > 0) {
      await this.flush(chatJid, items);
    }
  }

  /** Flush everything immediately (shutdown / tests). */
  async stop(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    const chatJids = [...this.buffers.keys()];
    for (const chatJid of chatJids) {
      await this.drain(chatJid);
    }
  }
}
