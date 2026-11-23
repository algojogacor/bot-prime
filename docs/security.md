# Security

## Secrets

- All credentials arrive via environment variables validated by the zod schema
  (`src/config/env.ts`); `.env` is git-ignored, only `.env.example` (placeholders) is
  committed.
- On Koyeb, secrets use `{{ secret.NAME }}` interpolation and never appear in logs.
- The logger redacts `apiKey`/`authToken`/`token`/`password` fields and their common
  shapes (`src/logger.ts`).
- CI test runs use placeholder credentials and touch no real service (workflow file).

## WhatsApp session

- Baileys auth blobs (session keys, pre-keys, sender keys, app-state sync keys,
  lid-mapping, device-list, tctoken, creds) are AES-256-GCM encrypted before storage
  (`src/db/crypto.ts`, `src/db/auth-store.ts`). Losing `AUTH_ENCRYPTION_KEY` renders
  the stored session unreadable (fail-closed: entries are treated as missing →
  re-pair).
- The encryption key must be rotated only together with a re-pair — the session is
  re-created cleanly when the store is wiped (`clearAuthStore`).
- No manual ACKs are sent anywhere (Baileys 7 removed them; WhatsApp bans accounts
  that send them). Sending happens exclusively through `sock.sendMessage`.

## Data handling

- The archive analysis that produced the language profile kept **private participant
  data out of this repository** (names/phones stay in the workspace analysis
  artifacts, which are not committed).
- The DB stores: normalized message text, derived memories, sticker blobs, usage
  counters, group metadata snapshots. Retention (60 days messages, 30 days
  low-importance memories) bounds exposure and storage.
- `lid_map` and participant snapshots contain JIDs — necessary for the participant
  resolver; treated as personal data, same retention discipline applies to
  participants snapshots being replaceable at any time.

## Attack surface

| Surface | Mitigation |
| --- | --- |
| Malicious group content (links, media, huge texts) | text is capped at prompt assembly (2,000 chars), media downloads are try/catch-wrapped, no shell-outs |
| Prompt injection via chat ("ignore instructions…") | persona prompt is system-level; validator caps/cleans output; truth-boundary check drops fabricated claims; stickers/commands are token-exact, not LLM-driven |
| Admin command abuse | admin-only commands gated by JID/digit matching; non-admins get a fixed refusal |
| Dependency supply chain | `npm audit` clean at release; install scripts allow-listed (`allowScripts` in package.json: baileys, protobufjs, esbuild only); CI runs audit (report-only step) |
| Media processing | sharp decodes in-process; sticker conversion writes only DB blobs; no temp-file reuse across messages |
| Log leakage | pino redact list covers key material fields; pairing codes are logged once at issuance by design (operator needs them) |

## Reporting

Internal bot for a private community — no public bug bounty. For issues, open a
restricted-access issue in the repo and ping the admins via the group.

## Checklist followed at release

1. `npm audit --audit-level=high` → 0 vulnerabilities.
2. Secret scan of the tree and git history → no committed credentials (see below).
3. `.env` untracked; `git status` clean of runtime artifacts (`data/`, `dist/`).
4. CI workflow passes lint/typecheck/test/build on Node 24.
