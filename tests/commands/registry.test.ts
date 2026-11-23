import { describe, expect, it } from 'vitest';
import { CommandRegistry } from '../../src/commands/registry.js';

describe('CommandRegistry', () => {
  it('parses the ! prefix into name and args', () => {
    const registry = new CommandRegistry();
    expect(registry.parse('!sticker add Moai 🗿')).toEqual({
      name: 'sticker',
      args: ['add', 'Moai', '🗿'],
    });
    expect(registry.parse('hello wkwk')).toBeNull();
    expect(registry.parse('!')).toBeNull();
  });

  it('gates admin-only commands behind isAdmin', async () => {
    const registry = new CommandRegistry();
    const replies: string[] = [];
    let ran = false;
    registry.register('secret', {
      adminOnly: true,
      run: async () => {
        ran = true;
      },
    });
    const base = {
      chatJid: 'g@lid',
      senderJid: '1@lid',
      senderName: 'a',
      recentRaw: () => [],
      reply: async (text: string) => {
        replies.push(text);
      },
    };

    await registry.handle('!secret x', { ...base, isAdmin: false });
    expect(ran).toBe(false);
    expect(replies).toEqual(['khusus admin 🗿']);

    await registry.handle('!secret x', { ...base, isAdmin: true });
    expect(ran).toBe(true);
  });

  it('returns false for unknown commands and true for handled ones', async () => {
    const registry = new CommandRegistry();
    registry.register('ping', { run: async ({ reply }) => reply('pong wkwk') });
    const base = {
      chatJid: 'g@lid',
      senderJid: '1@lid',
      senderName: 'a',
      isAdmin: true,
      recentRaw: () => [],
      reply: async () => undefined,
    };
    expect(await registry.handle('!ping', base)).toBe(true);
    expect(await registry.handle('!nope', base)).toBe(false);
    expect(await registry.handle('just chatting', base)).toBe(false);
  });
});
