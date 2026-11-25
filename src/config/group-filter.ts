import { env, parseList } from './env.js';

/**
 * Group allow-list gate — the FIRST check in the inbound pipeline.
 *
 * Semantics of OMAK_ALLOWED_GROUP_JIDS (comma-separated group JIDs):
 *   - unset/empty  → legacy behavior: every group is allowed (no filtering)
 *   - set          → ONLY those group JIDs are processed; every other group
 *                    is dropped before persistence, burst collection, command
 *                    handling or any AI/provider call — total silence, zero cost.
 *   - non-group chats (DMs @s.whatsapp.net / @lid, newsletters, broadcast)
 *                    are NEVER filtered by this list: personal DM usage of the
 *                    bot stays working regardless of the group allow-list.
 *
 * The list is read from the environment once per lookup (module-level cached
 * in allowedGroups()) so an operator can change behavior with a plain .env
 * edit + pm2 restart — no rebuild, no redeploy.
 */

let cachedRaw: string | null = null;
let cachedSet: Set<string> | null = null;

/** Strip a device suffix (":12") from a JID for comparison purposes. */
function normalizeJid(jid: string): string {
  return jid.replace(/:\d+@/, '@').trim().toLowerCase();
}

/**
 * The allow-list as a Set of normalized group JIDs; null when filtering is
 * disabled (empty/unset env), which means "allow all groups".
 */
function allowedGroups(): Set<string> | null {
  const raw = env.OMAK_ALLOWED_GROUP_JIDS;
  if (raw === cachedRaw && cachedSet !== undefined) return cachedSet;
  cachedRaw = raw;
  if (!raw || raw.trim().length === 0) {
    cachedSet = null;
    return cachedSet;
  }
  cachedSet = new Set(parseList(raw).map(normalizeJid));
  return cachedSet;
}

/** True when the chat is a group chat (`…@g.us`). */
export function isGroupChat(chatJid: string): boolean {
  return chatJid.endsWith('@g.us');
}

/**
 * Whether an incoming chat may be processed at all. Groups are checked
 * against the allow-list; non-group chats always pass (DM audit decision:
 * the number is also used for personal chats, which must keep working).
 */
export function isChatAllowed(chatJid: string): boolean {
  if (!isGroupChat(chatJid)) return true;
  const allow = allowedGroups();
  if (allow === null) return true;
  return allow.has(normalizeJid(chatJid));
}

/** Introspection for startup logs and health endpoints. */
export function allowedGroupsList(): string[] | null {
  const allow = allowedGroups();
  return allow === null ? null : [...allow];
}
