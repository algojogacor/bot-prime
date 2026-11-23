export type ValidationResult = { ok: true; text: string } | { ok: false; reason: string };

const MAX_LENGTH = 1_000;

/**
 * Validate/normalize an AI reply before it goes to WhatsApp:
 * - strips leaked markdown fences (jsonMode providers sometimes wrap anyway),
 * - caps length (a chat bot quoting an essay is a persona violation),
 * - collapses 3+ blank lines to keep the short-burst style.
 */
export function validateReply(raw: string): ValidationResult {
  let text = raw.trim();
  if (!text) return { ok: false, reason: 'empty' };

  text = text
    .replace(/^```[a-zA-Z0-9_-]*\n?/, '')
    .replace(/```\s*$/, '')
    .trim();
  if (!text) return { ok: false, reason: 'empty-after-fence-strip' };

  if (text.length > MAX_LENGTH) {
    text = `${text.slice(0, MAX_LENGTH).trimEnd()}…`;
  }
  text = text.replace(/\n{3,}/g, '\n\n');
  return { ok: true, text };
}

/** Parse a JSON-mode reply, tolerating a wrapped fence. Returns null when invalid. */
export function parseJsonReply<T>(raw: string): T | null {
  const stripped = raw
    .replace(/^```[a-zA-Z0-9_-]*\n?/, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    return null;
  }
}
