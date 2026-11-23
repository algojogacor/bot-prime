export type StarterInput = {
  /** Current hour in WIB (UTC+7), 0-23. */
  hourWib: number;
  /** Minutes since the chat's last message; null when unknown. */
  minutesSinceLast: number | null;
  startersToday: number;
  maxStartersPerDay: number;
};

/**
 * Proactive conversation starters are the most annoying thing a bot can do
 * wrong, so the gates are strict: evening activity window only (the corpus
 * peaks 19-21 WIB and 23:00-07:00 is dead), only when the group has been
 * quiet for a while, and rarely.
 */
export function shouldStartConversation(input: StarterInput): boolean {
  if (input.startersToday >= input.maxStartersPerDay) return false;
  if (input.hourWib < 18 || input.hourWib >= 22) return false;
  if (input.minutesSinceLast === null) return false;
  return input.minutesSinceLast >= 45;
}

export function buildStarterPrompt(topics: string[], memories: string[]): string {
  return [
    'Bikin SATU kalimat pembuka obrolan santai (gaya anak grup gaming Indonesia, huruf kecil, maksimal 12 kata).',
    'Boleh nanya balik atau lempar topik. Jangan pakai emoji lebih dari satu.',
    topics.length > 0 ? `Topik yang lagi hangat: ${topics.join(', ')}.` : 'Tidak ada topik khusus.',
    memories.length > 0 ? `Fakta grup: ${memories.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Fallback starters — generic, no invented facts. */
export function localStarter(topics: string[]): string {
  if (topics.length > 0) {
    return `eh ${topics[0]} gimana nnti? gas gk?`;
  }
  return 'ga ada yg online ya 🗿';
}
