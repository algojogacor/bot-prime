/**
 * LRU-style seen-set for message ids. WhatsApp redelivers messages after
 * reconnects; without this the bot would double-process them.
 */
export class MessageDeduper {
  private seen = new Map<string, true>();

  constructor(private readonly capacity = 4_096) {}

  /** Returns true if the id was already observed. */
  check(id: string): boolean {
    if (this.seen.has(id)) return true;
    this.seen.set(id, true);
    while (this.seen.size > this.capacity) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
    return false;
  }

  get size(): number {
    return this.seen.size;
  }
}
