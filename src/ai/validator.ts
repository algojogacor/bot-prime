export type ValidationResult = { ok: true; text: string } | { ok: false; reason: string };

/**
 * Validate/normalize an AI reply before it goes to WhatsApp:
 * - strips leaked markdown fences (jsonMode providers sometimes wrap anyway),
 * - unwraps an accidental whole-reply JSON envelope ({"speak": ...}),
 * - collapses 3+ blank lines.
 * NO arbitrary length cap: long answers are valid; the WhatsApp transport
 * splits them into ordered bubbles instead of truncating content.
 */
export function validateReply(raw: string): ValidationResult {
  let text = raw.trim();
  if (!text) return { ok: false, reason: 'empty' };

  text = text
    .replace(/^```[a-zA-Z0-9_-]*\n?/, '')
    .replace(/```\s*$/, '')
    .trim();
  if (!text) return { ok: false, reason: 'empty-after-fence-strip' };

  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const obj = JSON.parse(text) as { speak?: unknown; text?: unknown; reply?: unknown };
      const spoken =
        typeof obj.speak === 'string' ? obj.speak
        : typeof obj.text === 'string' ? obj.text
        : typeof obj.reply === 'string' ? obj.reply
        : null;
      if (spoken && spoken.trim()) text = spoken.trim();
    } catch {
      // plain text that happens to look like JSON — keep as-is
    }
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
