export type ValidationResult = { ok: true; text: string } | { ok: false; reason: string };

/**
 * Strip control characters that corrupt WhatsApp text or DB storage
 * (observed live: a NUL byte persisted at the end of a reply). Keeps \n
 * (paragraphs) and \t. C1 range included — some providers emit it.
 */
function stripControlChars(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
}

/**
 * The model occasionally prefixes its reply with the transcript label it
 * saw in the prompt's history ("omak: wkwk …") — observed live in the group.
 * Strip a leading self-label; other speakers' labels stay (never seen,
 * and the group would rightly call that out).
 */
function stripSelfLabel(text: string): string {
  return text.replace(/^[ \t]*(?:omak|omak peak)[ \t]*:[ \t]*/i, '');
}

/**
 * Validate/normalize an AI reply before it goes to WhatsApp:
 * - strips control characters and a leaked "omak:" self-label,
 * - strips leaked markdown fences (jsonMode providers sometimes wrap anyway),
 * - unwraps an accidental whole-reply JSON envelope ({"speak": ...}),
 * - collapses 3+ blank lines.
 * NO arbitrary length cap: long answers are valid; the WhatsApp transport
 * splits them into ordered bubbles instead of truncating content.
 */
export function validateReply(raw: string): ValidationResult {
  let text = stripControlChars(raw).trim();
  if (!text) return { ok: false, reason: 'empty' };

  text = stripSelfLabel(text);
  if (!text) return { ok: false, reason: 'empty-after-label-strip' };

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
