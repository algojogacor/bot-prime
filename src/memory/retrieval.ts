import type { Client } from '@libsql/client';
import { listTopMemories, searchMemories, touchMemory } from '../db/repos/memories.js';

const STOP = new Set([
  'yang', 'yg', 'di', 'ke', 'dari', 'dan', 'atau', 'itu', 'ini', 'nya', 'ga', 'gk', 'gak',
  'kaga', 'aja', 'udh', 'udah', 'apa', 'siapa', 'kapan', 'kenapa', 'gmn', 'gimana', 'the',
  'and', 'buat', 'bisa', 'mau', 'ada', 'kita', 'kamu', 'gw', 'lu', 'aku', 'yah', 'yak',
]);

/** Content-bearing lowercase terms for FTS matching (no stopwords, max 8). */
export function termsFrom(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^\w[\]{}|@]+/)
    .filter((t) => t.length >= 4 && !STOP.has(t) && !/^\d+$/.test(t));
  return [...new Set(tokens)].slice(0, 8);
}

/**
 * Compose the memory block for the prompt: term-matched memories first
 * (touching them records usage), falling back to the chat's top memories so
 * the bot always knows its own history about a chat.
 */
export async function buildMemoryContext(
  db: Client,
  chatJid: string,
  currentText: string,
): Promise<string | null> {
  let memories = await searchMemories(db, chatJid, termsFrom(currentText), 4);
  if (memories.length === 0) {
    memories = await listTopMemories(db, chatJid, 3);
  }
  if (memories.length === 0) return null;

  for (const m of memories) {
    void touchMemory(db, m.id).catch(() => undefined);
  }
  return memories.map((m) => `- [${m.kind}] ${m.content}`).join('\n');
}
