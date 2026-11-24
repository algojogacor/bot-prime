import type { AIRouter } from '../ai/router.js';
import type { ShortTermMessage } from './short-term.js';

const STOP = new Set([
  'yang', 'yg', 'di', 'ke', 'dari', 'dan', 'atau', 'itu', 'ini', 'nya', 'ga', 'gk', 'gak',
  'aja', 'udh', 'udah', 'apa', 'siapa', 'kapan', 'kenapa', 'gmn', 'gimana', 'jam', 'wkwk',
  'wkwkwk', 'jir', 'wok', 'lah', 'sih', 'dong', 'deh', 'yah', 'yak', 'kan', 'kok', 'mah',
  'banget', 'bgt', 'dah', 'buat', 'pake', 'kali', 'gara', 'abis', 'pas', 'ama', 'sama',
]);

/**
 * No-AI fallback summary: time span, top content tokens, participant count.
 * Always grounded in the actual segment — used when the provider is down.
 */
export function heuristicSummary(msgs: ShortTermMessage[]): string {
  if (msgs.length === 0) return '';
  const counts = new Map<string, number>();
  for (const m of msgs) {
    for (const token of m.text.toLowerCase().split(/[^\w[\]{}|]+/)) {
      if (token.length >= 4 && !STOP.has(token)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([token]) => token);
  const people = new Set(msgs.map((m) => m.sender)).size;
  const span = `${fmtTime(msgs[0]?.timestamp)}-${fmtTime(msgs[msgs.length - 1]?.timestamp)}`;
  const topicPart = top.length > 0 ? `, topik: ${top.join(', ')}` : '';
  return `Ringkas: ${msgs.length} pesan dari ${people} orang (${span})${topicPart}.`;
}

function fmtTime(ts?: number): string {
  if (!ts) return '?';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** AI summary in the group's casual register; falls back to heuristic on failure. */
export async function aiSummarize(
  router: AIRouter,
  msgs: ShortTermMessage[],
): Promise<string> {
  const body = msgs
    .slice(-60)
    .map((m) => `${m.sender}: ${m.text}`)
    .join('\n')
    .slice(0, 3_000);
  try {
    const result = await router.generate({
      system:
        'Ringkas segmen chat grup gaming dalam 1-2 kalimat santai bahasa Indonesia. ' +
        'Sebutkan topik utama dan apa yang diputuskan/diulang orang. Maksimal 30 kata, tanpa sapaan.',
      messages: [{ role: 'user', content: body }],
      maxTokens: 320,
    });
    const text = result.text.trim();
    return text.length > 0 ? text : heuristicSummary(msgs);
  } catch {
    return heuristicSummary(msgs);
  }
}
