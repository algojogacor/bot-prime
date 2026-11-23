/**
 * Rage-bait guard: tracks users who keep demanding nastier content.
 * After `maxConsecutive` asks within the decay window, the user is cooled down
 * — the bot answers with the canned deflection instead of escalating.
 */
export class RageBaitLimiter {
  private attempts = new Map<string, { count: number; lastAt: number }>();

  constructor(
    private readonly maxConsecutive = 3,
    private readonly decayMs = 30 * 60_000,
  ) {}

  /** True when the request should still be honored. */
  registerAttempt(userId: string, now: number): boolean {
    const entry = this.attempts.get(userId);
    const count =
      entry && now - entry.lastAt < this.decayMs ? entry.count + 1 : 1;
    this.attempts.set(userId, { count, lastAt: now });
    return count <= this.maxConsecutive;
  }

  isBlocked(userId: string, now: number): boolean {
    const entry = this.attempts.get(userId);
    if (!entry) return false;
    if (now - entry.lastAt >= this.decayMs) return false;
    return entry.count > this.maxConsecutive;
  }

  reset(userId: string): void {
    this.attempts.delete(userId);
  }
}

const RAGE_PATTERNS: RegExp[] = [
  /\bhina\s+(dia|mereka|lu|dia khe?\b)/i,
  /\btoxic(?:in|kan)?\b/i,
  /\bkasih\s+kata\s+(kasar|kotor|pedas)\b/i,
  /\broast\s+habis/i,
  /\bngetawain\s+(dia|mereka)\s+sampai/i,
  /\bserang\s+(balik|dia)\b/i,
  /\bnst\b/i,
];

/** Heuristic: does this message ask for escalating nastiness? */
export function isRageBaitRequest(text: string): boolean {
  return RAGE_PATTERNS.some((re) => re.test(text));
}

export const RAGE_BAIT_DEFLECTIONS: string[] = [
  'udah udah wkwk nanti beneran tersinggung',
  'gapapa ga jadi 🗿',
  'cukup segini aja wkwk',
];
