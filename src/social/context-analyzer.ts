export type BurstSignal = { sender: string; text: string };

export type BurstContext = {
  isBanter: boolean;
  isQuestion: boolean;
  /** Same text repeated inside one burst (spam or hype). */
  repeatCount: number;
  hasLinks: boolean;
  sentiment: 'positive' | 'negative' | 'neutral';
  /** Gaming/topic tokens found (spar, turnamen, rank, uid, mandul, ...). */
  topics: string[];
  /** Distinct senders in the burst. */
  senders: string[];
};

const BANTER_TOKENS = new Set(['wkwk', 'wkwkwk', 'jir', 'wok', 'anj', '🗿', '😹', '🤣', '😭']);
const POSITIVE = new Set(['gas', 'siap', 'mantap', 'gacor', 'menang', 'win', 'seru', 'gokil', 'yoi', 'bet']);
const NEGATIVE = new Set(['kalah', 'mandul', 'noob', 'lemah', 'badut', 'sepuh', 'afk', 'pushrank gagal']);
const TOPIC_TOKENS = new Set([
  'spar', 'turnamen', 'rank', 'uid', 'mabar', 'kiper', 'cb', 'st', 'wf', 'gk', 'login',
  'event', 'turn', 'cut', 'lawan', 'tim', 'eclipse', 'yonkou', 'mandul', 'pushrank',
]);
const LINK_RE = /https?:\/\/|\btiktok\.com|\bvt\.tiktok|\binstagram\.com/i;

/** Heuristic read of what a burst "is" — pure, instant, no AI. */
export function analyzeBurst(burst: BurstSignal[]): BurstContext {
  const texts = burst.map((m) => m.text);
  const lowered = texts.map((t) => t.toLowerCase());
  const tokens = lowered.flatMap((t) => t.split(/[^\w[\]{}|🗿😭😹🤣😈]+/)).filter(Boolean);

  const isBanter = tokens.some((t) => BANTER_TOKENS.has(t));
  const isQuestion = texts.some((t) => t.includes('?') || /^(apa|siapa|kapan|kenapa|gimana|gmn|berapa)\b/i.test(t.trim()));
  const counts = new Map<string, number>();
  for (const t of lowered) counts.set(t, (counts.get(t) ?? 0) + 1);
  const repeatCount = Math.max(...counts.values(), 0);
  const hasLinks = texts.some((t) => LINK_RE.test(t));
  const positive = tokens.filter((t) => POSITIVE.has(t)).length;
  const negative = tokens.filter((t) => NEGATIVE.has(t)).length;
  const sentiment =
    positive > negative ? 'positive' : negative > positive ? 'negative' : 'neutral';
  const topics = [...new Set(tokens.filter((t) => TOPIC_TOKENS.has(t)))];

  return {
    isBanter,
    isQuestion,
    repeatCount,
    hasLinks,
    sentiment,
    topics,
    senders: [...new Set(burst.map((m) => m.sender))],
  };
}
