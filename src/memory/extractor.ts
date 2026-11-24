import { AIProviderError } from '../ai/types.js';
import type { AIRouter } from '../ai/router.js';
import { parseJsonReply } from '../ai/validator.js';
import type { MemoryKind } from '../db/repos/memories.js';

export type ExtractedMemory = {
  kind: MemoryKind;
  content: string;
  importance: number;
  /** Message the fact came from — stored as source_msg_id (provenance). */
  sourceMsgId?: string;
};

type RawExtraction = { kind?: string; content?: string; importance?: number };

const KINDS: MemoryKind[] = ['fact', 'event', 'inside_joke', 'preference', 'summary'];

/**
 * Heuristic (no-AI) memory extraction. Catches the durable, recognizable
 * things this community posts: birthdays, UIDs, event times, "panggil aja X"
 * nicknames and hard preferences ("jangan call jam 5"). Cheap, runs on every
 * burst, never hallucinates — everything it stores appeared verbatim, and each
 * entry carries the id of the message it was extracted from.
 */
export function heuristicExtract(items: { id: string; text: string }[]): ExtractedMemory[] {
  const out = new Map<string, ExtractedMemory>();
  const add = (kind: MemoryKind, content: string, importance: number, sourceMsgId?: string) => {
    const key = content.toLowerCase();
    if (!out.has(key)) out.set(key, { kind, content, importance, sourceMsgId });
  };

  for (const item of items) {
    const text = item.text;
    const birthday = text.match(/(?:ultah|ulang tahun|birthday)\D{0,12}(\d{1,2}[\/\- ]\w{3,9}|\d{1,2}\/\d{1,2})/i);
    if (birthday?.[1]) add('fact', `Ultah: ${birthday[1].trim()} (dari chat)`, 4, item.id);

    const uid = text.match(/\buid\b\D{0,10}(\d{6,12})/i);
    if (uid?.[1]) add('fact', `UID: ${uid[1]}`, 3, item.id);

    const nickname = text.match(/panggil aja\s+([\w.]{2,20})/i);
    if (nickname?.[1]) add('fact', `Panggilan: ${nickname[1]}`, 2, item.id);

    const event = text.match(
      /(?:turnamen|event|spar|cut turn)\b.{0,40}?(?:tanggal|jam|tgl)\s+([\w:\-\/\. ]{2,20})/i,
    );
    if (event?.[1]) add('event', `${event[0].slice(0, 80).trim()}`, 3, item.id);

    const preference = text.match(/jangan\s+(.{3,40})/i);
    if (preference?.[1]) add('preference', `Jangan ${preference[1].trim()}`, 2, item.id);

    const rank = text.match(/\b(?:rank|tier)\s+(\w{2,12})\b/i);
    if (rank?.[1]) add('fact', `Rank: ${rank[1].toUpperCase()}`, 1, item.id);
  }

  return [...out.values()].slice(0, 5);
}

/**
 * AI-assisted extraction. Returns [] on any failure — the heuristic pass above
 * already ran, so a provider outage never blocks memory writes entirely.
 */
export async function aiExtract(
  router: AIRouter,
  texts: string[],
): Promise<ExtractedMemory[]> {
  if (texts.length === 0) return [];
  try {
    const result = await router.generate({
      system:
        'Kamu ekstraktor memori. Dari pesan chat, ekstrak FAKTA BERTAHAN (fakta orang, event, preferensi, inside joke). ' +
        'Balas JSON: {"memories":[{"kind":"fact|event|inside_joke|preference","content":"<max 120 chars, bahasa asli chat>","importance":1-5}]}. ' +
        'Jangan mengarang. Maksimal 5 item. Kalau tidak ada yang layak disimpan, balas {"memories":[]}.',
      messages: [{ role: 'user', content: texts.join('\n').slice(0, 2_000) }],
      jsonMode: true,
      maxTokens: 300,
    });

    const parsed = parseJsonReply<{ memories?: RawExtraction[] }>(result.text);
    const raw = parsed?.memories ?? [];
    const out: ExtractedMemory[] = [];
    for (const item of raw.slice(0, 5)) {
      const kind = KINDS.includes(item.kind as MemoryKind) ? (item.kind as MemoryKind) : 'fact';
      const content = (item.content ?? '').trim().slice(0, 160);
      if (content.length < 3) continue;
      const importance = Math.min(5, Math.max(1, Math.round(item.importance ?? 1)));
      out.push({ kind, content, importance });
    }
    return out;
  } catch (err) {
    if (err instanceof AIProviderError) return [];
    return [];
  }
}
