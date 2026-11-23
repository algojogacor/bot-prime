import type { BurstContext } from './context-analyzer.js';

export type RoastInput = {
  senderName: string;
  context: BurstContext;
  /** Real, verified facts only — never fabricated. */
  senderIdleMinutes?: number;
  lastSenderText?: string;
};

/**
 * Template roasts grounded strictly in observable facts. Returns null when
 * there is no real material — the bot stays silent instead of inventing
 * claims (truth boundary). "mandul" is this community's standard banter for
 * inactivity, so it is used exactly for that: observed inactivity.
 */
export function localRoast(input: RoastInput): string | null {
  const { senderName, context } = input;

  if (context.repeatCount >= 3 && input.lastSenderText) {
    const snippet = input.lastSenderText.slice(0, 24);
    return `${senderName} ngirim "${snippet}" ${context.repeatCount}x, error kan jari lu 🗿`;
  }

  if (input.senderIdleMinutes !== undefined && input.senderIdleMinutes >= 120) {
    const hours = Math.floor(input.senderIdleMinutes / 60);
    return `${hours} jam ga nongol ${senderName} tim mandul beneran wkwk`;
  }

  if (context.sentiment === 'negative' && context.topics.includes('kalah')) {
    return `${senderName} kalah lagi? wok berisik banget hasilnya gitu doang wkwk`;
  }

  return null;
}

/** Extra prompt lines that steer the AI roast without removing the leash. */
export const ROAST_GUIDELINES = [
  'Boleh bantai/banter, tapi HANYA pakai fakta yang benar-benar ada di konteks chat atau fakta tersimpan.',
  'JANGAN mengarang kejadian, angka, atau ucapan orang. Kalau bahan kurang, bales biasa aja.',
  'Roast maksimal 1-2 baris, gaya teman satu tim, bukan hinaan berat.',
].join('\n');
