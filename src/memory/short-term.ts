export type ShortTermMessage = { sender: string; text: string; timestamp: number };

/**
 * In-process ring buffer of the latest messages per chat. This is the fast
 * context path for the prompt builder; durable context lives in the DB
 * (messages + memories). Counters reset on restart by design.
 */
export class ShortTermStore {
  private buffers = new Map<string, ShortTermMessage[]>();

  constructor(
    private readonly perChatCapacity = 40,
    private readonly maxChats = 50,
  ) {}

  push(chatJid: string, msg: ShortTermMessage): void {
    let buffer = this.buffers.get(chatJid);
    if (!buffer) {
      while (this.buffers.size >= this.maxChats) {
        const oldest = this.buffers.keys().next().value;
        if (oldest === undefined) break;
        this.buffers.delete(oldest);
      }
      buffer = [];
      this.buffers.set(chatJid, buffer);
    }
    buffer.push(msg);
    if (buffer.length > this.perChatCapacity) {
      buffer.splice(0, buffer.length - this.perChatCapacity);
    }
  }

  recent(chatJid: string, n = 20): ShortTermMessage[] {
    const buffer = this.buffers.get(chatJid);
    if (!buffer) return [];
    return buffer.slice(-n);
  }

  lastMessage(chatJid: string): ShortTermMessage | null {
    const buffer = this.buffers.get(chatJid);
    return buffer?.length ? (buffer[buffer.length - 1] ?? null) : null;
  }

  /** Minutes since the chat's last message; null when the chat is unknown. */
  minutesSinceLastMessage(chatJid: string, now = Date.now()): number | null {
    const last = this.lastMessage(chatJid);
    if (!last) return null;
    return Math.floor((now - last.timestamp) / 60_000);
  }

  activeChats(): string[] {
    return [...this.buffers.keys()];
  }
}
