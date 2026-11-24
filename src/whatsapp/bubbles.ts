/**
 * Split a long reply into ordered WhatsApp bubbles without losing content.
 *
 * Splitting strategy (paragraph → sentence → hard-wrap), never mid-word:
 *  1. Paragraph blocks (blank lines) become bubbles first — a 2-3 paragraph
 *     explanation arrives as 2-3 bubbles, one per paragraph, in order.
 *  2. A single paragraph longer than `bubbleChars` splits at sentence
 *     boundaries.
 *  3. A monster sentence splits at word boundaries as a last resort.
 *  4. Rejoins a trailing fragment (< MIN_SPLIT chars) into the previous bubble
 *     so a one-word orphan never becomes its own bubble.
 *
 * Nothing is dropped: join(bubbles) === the original text (modulo the exact
 * boundary whitespace that separates them).
 */
export const SPLIT_BUBBLE_CHARS = 1_500; // WhatsApp handles comfortably; multi-bubble for long ones

const MIN_TAIL_MERGE = 80; // don't leave a tiny orphan bubble

export function splitIntoBubbles(text: string, bubbleChars = SPLIT_BUBBLE_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= bubbleChars) return [trimmed];

  const bubbles: string[] = [];

  // 1. paragraph pass
  const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  let current = '';
  for (const para of paragraphs) {
    if (para.length > bubbleChars) {
      if (current) { bubbles.push(current); current = ''; }
      for (const piece of splitLongParagraph(para, bubbleChars)) bubbles.push(piece);
      continue;
    }
    if ((current + '\n\n' + para).length <= bubbleChars) {
      current = current ? `${current}\n\n${para}` : para;
    } else {
      if (current) bubbles.push(current);
      current = para;
    }
  }
  if (current) bubbles.push(current);

  // 2. merge a too-small trailing bubble into its predecessor
  const out: string[] = [];
  for (const b of bubbles) {
    if (out.length > 0 && b.length < MIN_TAIL_MERGE) {
      const prev = out[out.length - 1] as string;
      out[out.length - 1] = `${prev}\n${b}`;
    } else {
      out.push(b);
    }
  }
  return out;
}

function splitLongParagraph(para: string, bubbleChars: number): string[] {
  // sentence-boundary pass
  const sentences = para.match(/[^.!?]+[.!?]*(\s+|$)/g) ?? [para];
  const pieces: string[] = [];
  let buf = '';
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if (buf.length + piece.length + 1 <= bubbleChars) {
      buf = buf ? `${buf} ${piece}` : piece;
    } else {
      if (buf) pieces.push(buf);
      if (piece.length <= bubbleChars) {
        buf = piece;
      } else {
        // 3. word-boundary hard wrap for a monster sentence
        for (const chunk of hardWrap(piece, bubbleChars)) pieces.push(chunk);
        buf = '';
      }
    }
  }
  if (buf) pieces.push(buf);
  return pieces.length > 0 ? pieces : [para];
}

function hardWrap(piece: string, bubbleChars: number): string[] {
  const words = piece.split(/\s+/);
  const chunks: string[] = [];
  let buf = '';
  for (const word of words) {
    if (buf.length + word.length + 1 <= bubbleChars) {
      buf = buf ? `${buf} ${word}` : word;
    } else {
      if (buf) chunks.push(buf);
      buf = word;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}
