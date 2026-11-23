import type { WAMessage } from '@whiskeysockets/baileys';

export type CommandContext = {
  chatJid: string;
  senderJid: string;
  senderName: string;
  isAdmin: boolean;
  /** Last raw messages seen in this chat (for sticker-add media intake). */
  recentRaw: () => WAMessage[];
  reply: (text: string) => Promise<void>;
};

export type CommandHandler = {
  adminOnly?: boolean;
  run: (ctx: CommandContext & { args: string[] }) => Promise<void>;
};

const PREFIX = '!';

export class CommandRegistry {
  private readonly commands = new Map<string, CommandHandler>();

  register(name: string, handler: CommandHandler): void {
    this.commands.set(name.toLowerCase(), handler);
  }

  /** Returns true when the text was a command (handled or rejected). */
  async handle(text: string, ctx: CommandContext): Promise<boolean> {
    const parsed = this.parse(text);
    if (!parsed) return false;
    const handler = this.commands.get(parsed.name);
    if (!handler) return false;
    if (handler.adminOnly && !ctx.isAdmin) {
      await ctx.reply('khusus admin 🗿');
      return true;
    }
    await handler.run({ ...ctx, args: parsed.args });
    return true;
  }

  parse(text: string): { name: string; args: string[] } | null {
    if (!text.startsWith(PREFIX)) return null;
    const parts = text.slice(PREFIX.length).trim().split(/\s+/).filter(Boolean);
    const name = parts[0]?.toLowerCase();
    if (!name) return null;
    return { name, args: parts.slice(1) };
  }

  names(): string[] {
    return [...this.commands.keys()];
  }
}
