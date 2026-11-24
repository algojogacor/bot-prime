/**
 * The truth boundary: Omak may roast, but every claim about what people said
 * or did must be verifiable from the context the bot can actually see.
 * This module is the mechanical half of that rule — the prompt half lives in
 * the system prompt ("jangan mengarang").
 */

const CLAIM_PATTERNS: RegExp[] = [
  /\b(?:kemarin|kemaren|tadi|semalem|seminggu lalu)\b.{0,20}\b(?:lu|kamu|elo|dia)\b.{0,20}\b(?:bilang|ngatain|nyuruh|ngaku)\b/i,
  /\b(?:lu|kamu|elo)\b.{0,20}\b(?:bilang|ngatain)\b.{0,10}["“']/,
];

/**
 * Returns true when the reply makes a claim about past speech/behavior whose
 * quoted substance does NOT appear in the provided context text — i.e. a
 * fabricated claim. Context should include recent messages + memories.
 */
export function hasUnverifiableClaim(reply: string, contextText: string): boolean {
  for (const re of CLAIM_PATTERNS) {
    const match = reply.match(re);
    if (!match) continue;
    // The claim is acceptable only if its subject words appear in the context.
    const words = (reply.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(
      (w) => !['kemarin', 'kemaren', 'tadi', 'bilang', 'ngatain', 'nyuruh', 'ngaku', 'kamu', 'semalem'].includes(w),
    );
    const contextLower = contextText.toLowerCase();
    const grounded = words.some((w) => contextLower.includes(w));
    if (!grounded) return true;
  }
  return false;
}

/** Safe replacement when a reply fails the truth check. */
export const TRUTH_FALLBACKS = [
  'wkwk ya gitu deh 🗿',
  'itu mah ngarang, gw ga bisa mastiin wkwk',
  'ga ada bahannya di chat, gw diam aja deh 🗿',
];
export const TRUTH_FALLBACK = TRUTH_FALLBACKS[0] as string;
/** Rotating pick so the safety fallback never repeats verbatim. */
export function nextTruthFallback(): string {
  return TRUTH_FALLBACKS[Math.floor(Math.random() * TRUTH_FALLBACKS.length)] as string;
}
