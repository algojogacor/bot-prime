# Research Findings — Omak (WhatsApp AI Companion Bot)

Date: 2026-11-23
Scope: community language profile, Gen Z sociolinguistics, humor/persona design, and the three platform pillars (Baileys v7, Turso, Koyeb) that the implementation depends on.
This document contains only aggregate and public information. Private participant identifiers (names, phone numbers, JIDs) were deliberately excluded; raw archive artifacts stay outside this repository.

---

## 1. Method and sources

Sources actually opened and read during this research phase:

| Source | URL |
| --- | --- |
| Sarasvati journal article on TikTok code-mixing (Vol. 7 No. 1, 2025-06-24, DOI 10.30742/sv.v7i1.4543, author Febrian Tegar P, Universitas Jember) | https://journal.uwks.ac.id/sarasvati/article/view/4543 |
| Bhinneka journal article on Instagram code-switching/mixing (Vol. 4 No. 3, 2026-06-30, DOI 10.59024/bhinneka.v4i3.1811, authors Muhammad Nurahmad and Nurasia Natsir) | https://pbsi-upr.id/index.php/Bhinneka/article/view/1811 |
| Baileys v7 migration guide | https://baileys.wiki/migration/v7 |
| Baileys installation guide | https://baileys.wiki/installation |
| Turso TypeScript quickstart | https://docs.turso.tech/sdk/ts |
| Turso TypeScript SDK reference | https://docs.turso.tech/sdk/ts/reference |
| Turso usage & billing (how quotas are measured) | https://docs.turso.tech/help/usage-and-billing |
| Turso Cloud known limitations | https://docs.turso.tech/cloud/limitations |
| Koyeb storage reference | https://www.koyeb.com/docs/reference/storage |
| Koyeb volumes reference | https://www.koyeb.com/docs/reference/volumes |
| Koyeb environment variables | https://www.koyeb.com/docs/build-and-deploy/environment-variables |
| Koyeb health checks | https://www.koyeb.com/docs/run-and-scale/health-checks |
| Zendesk AI agent persona guide (snippet only, not opened) | https://support.zendesk.com/hc/en-us/articles/8357758777626-Recommendations-for-building-an-AI-agent-persona-and-tone-of-voice |
| NiCE chatbot conversation design guide (snippet only, not opened) | https://www.nice.com/ai-chatbot-business/chatbot-conversation-design |

Additional sources surfaced by web search but not opened (titles only, listed for follow-up):
- Indonesian media coverage of generational humor styles (humor bapack vs Gen Z vs Gen Alpha) and "brainrot" memes (Skibidi Toilet, Tung Tung Sahur cited as Gen Alpha markers).
- "PEMANFAATAN BAHASA MEME OLEH GENERASI Z" (ANA Sabina, 2026, cited by 4) on meme ambiguity as a vehicle for social critique.
- npm registry: `npm view @whiskeysockets/baileys` (executed 2026-11-23; `latest` dist-tag = `7.0.0-rc14`, `legacy` = `6.7.24`).

Corpus evidence: statistical analysis of the target community's WhatsApp export (sanitized). Artifacts: scrubbed corpus and aggregate stats under the workspace analysis directory (not committed here).

---

## 2. Target community profile (archive analysis)

### 2.1 Identity validation (closed)

- The archive is the group **AVOID PRIME | FT**, created 2026-09-28 inside the WhatsApp community **AVOID CITY** (from the export's system lines; msg `m000002` in the normalized dataset).
- "GB Prime" is a colloquial reference to *Grup Besar Prime* — a related group in the same AVOID CITY ecosystem, not an unrelated community and not this group's name. It appears 3 times by name plus 1 direct comparison ("tp emg dibandingin prime/gb lebih rame prime"): a tournament focus call, a quiet-day complaint, an offhand remark. This archive IS AVOID PRIME | FT, and GB Prime references are in-ecosystem shorthand. (Reconciliation: docs/audit/community-dataset-audit.md §2.)
- The token "fp" (2,887 occurrences, word-boundary) marks the Flash Peak / FP circle this branch belongs to; "avoid" (386) and "prime" (499) corroborate the group name.
- Conclusion: proceed using this export as the canonical language sample for Omak.

> **Audit update (2026-11-23):** all corpus numbers in §2.2–2.6 were re-derived by
> the reproducible pipeline (`scripts/dataset/` → `data/seed/statistics.json`).
> Values below reflect the recomputed metrics where they differ; the itemized
> old-vs-new reconciliation is in docs/audit/community-dataset-audit.md §5.3.

### 2.2 Volume, rhythm, participation

- 79,090 messages parsed (78,899 user messages, 191 system events), 25 participants, window 2026-09-28 to 2026-11-23, 57 active days, average ≈1,384 messages/day.
- Hourly distribution peaks hard in the evening: 19:00 = 10,133, 20:00 = 14,758 (max), 21:00 = 10,185. Only 5.5% of traffic falls between 23:00 and 07:00.
  - Implication: scheduler and pro-active messages should target 18:00–22:00 WIB; treat 23:00–07:00 as quiet hours (no proactive pings).
- Weekday ranking: Sunday highest (15,563), Wednesday (12,336) and Thursday (11,919) next, Tuesday lowest (8,949).
- Participation concentration: top-1 participant 27.6% of messages, top-5 79.5%, top-10 94.8%; ten participants have 1,000+ messages.
  - Implication: the bot must blend into an existing fast core of ~10 very active people; flooding it would be instantly noticeable and annoying.
- Burst structure: 62.9% of sending-bursts are a single message, 22.1% are two messages → people fire short, separate lines rather than paragraphs.

### 2.3 Message shape and formatting

- Length: median 11 characters / 2 tokens; 68.1% of messages are ≤3 tokens; 0.5% reach 15+ tokens.
- Case: 36.0% of messages are entirely lowercase, 1.2% entirely uppercase.
- Emoji appear in only 2.6% of messages (2,547 emoji total, 180 distinct).
- Questions: 5.2% contain a question mark.

### 2.4 Register and vocabulary (token counts from the corpus)

- First person: **gw 4,777**, aku 2,136, ak 578, gua 187, gue 100, saya 64 → Jakarta-style gw/lu register; saya is effectively absent.
- Second person: **lu 1,023**, kamu 148, km 46, elu 38.
- Inclusive we: kita 964.
- Address terms: cok 499, bang 339, bro 214, bg 92, mas 90, temen 85, guys 62, cuy 56, coy 13, bestie 6.
- Negation: ga 1,642, gk 1,327, kaga 548, gak 526, engga 49, nggak 18 → nonstandard spellings dominate; produce "ga/gk", accept all variants.
- Fillers/interjections: jir 2,582, kan 839, si 552, cik 363, sih 333, mah 218, dong 211, loh 192, deh 171, yak 551, wok 1,641, weh 19, euy 10.
- Agreement/backchannel: ya 1,344, iya 833, ok 562, oke 433, y 337, bet 324, nah 226, siap 200, iyh 159, bener 167, yoi 15, mantap 15, sip 29.
- Intensity: bgt 173, parah 83, banget 59, amat 41.
- Laughter: **wkwk-family 1,598** vs awok 2, haha-family 5, lol/lmao 7 → the bot should laugh as "wkwk/wkwkwk", never "haha" or "lol".
- Top emoji: 🗿 839, 😭 151, 😹 142, 🤣 137, 😈 103, 😂 81, 🤭 70, 🥀 64, 🧢 24, 🔥 38, 🆚 46. The moai 🗿 is the group's signature reaction; emoji use overall should stay sparse (2.6% baseline).
- Profanity: 1,579 profanity tokens (documented 29-term list), 2.1% of messages, 22.1 per 1,000 text messages (the earlier ad-hoc pass reported 5,737 / 7.9% with a broader unrecorded list; substring matching yields 2,715) → rough banter is normal here; the bot may roast with local flavor but must never escalate into genuine insults (see §4 truth boundary).

### 2.5 English code-mixing and gaming vocabulary

- Only **3.0%** of messages contain any token from the broad English list (1.8% strict gaming-only). Top English tokens: match 248, bro 214, no 213, game 194, sorry 148, team 118, win 89, guys 62, wait 52, the 49, nice 47, play 28.
  - Calibration: the academic studies in §3 describe TikTok/Instagram behavior where mixing is pervasive. THIS community is a gaming community: English appears almost exclusively as gaming/loan vocabulary, not as stylistic sentence-mixing. The bot mirrors the community (light English gaming terms), not the median TikTok Gen Z.
- Gaming context (eFootball-style football gaming): spar 1,024, kiper 830, positions st 914 / cb 678 / wf 595 / gk, rank 377, uid, mabar, turnamen ("cut turn" 52), lawan 1,120 ("lawan siapa" 75, "lawan eclipse" 70), login 502, tim 720.
- Squad roster messages follow a fixed template visible in n-grams: "uid posisi nickname uid anggota nama lengkap no wa" — roster posts list UID, position, nickname, full name, phone.
- Community/team tokens: avoid (386), prime (499), eclipse 406, agi, impact, centra, fision (opponent/branch teams); yonkou強 913 and ambaking 480 are recurring unit/team labels; mandul 476 ("barren/impotent") is standard banter for an inactive team or player.
- Link sharing: TikTok links are common ("https vt tiktok com" 67 trigrams) → the bot may encounter TikTok URLs (relevant for future media handling).

### 2.6 Language drift

- Jaccard similarity of the top-80 token sets between the first and last third of the archive: **0.553** → a stable core with evolving slang. The language profile must be re-derived periodically (e.g. monthly) instead of being treated as static.

### 2.7 Style rules derived for Omak (language profile seed)

1. Reply in short bursts: 1–2 sentences, ideally ≤12 words; never paragraphs.
2. Lowercase by default; ALL CAPS only for emphasis gags.
3. First person gw, second person lu, inclusive kita; never saya/anda.
4. Negation ga/gk; fillers jir, wok, sih, dong, deh, yak; intensity bgt/parah.
5. Laugh as wkwk/wkwkwk; react with 🗿, 😭, 😹, 🤣 sparingly (emoji in a minority of messages).
6. English only as gaming/loan vocabulary (match, spar, rank, gg) — no TikTok-style sentence mixing.
7. Use the community's own banter vocabulary (mandul for inactive, bet/siap/yoi for agreement).
8. Never fabricate facts about people (truth boundary): roast on what actually happened in the chat, not invented claims.

---

## 3. Academic grounding: Gen Z code-mixing in Indonesia

### 3.1 Sarasvati (TikTok, 2025)

- Title: "Fenomena Campur Kode dalam Interaksi Digital Gen Z: Analisis Sosiolinguistik Kolom Komentar TikTok"; sole author Febrian Tegar P (Universitas Jember); sarasvati Vol. 7 No. 1 (2025), published 2025-06-24; DOI 10.30742/sv.v7i1.4543.
- Method: qualitative descriptive; data = TikTok comments on account @jeromepolin98. Sample size not stated on the abstract page.
- Findings: three forms — tag switching, intersentential switching, intrasentential switching; functions — self-expression, identity reinforcement, humor, religiosity, social prestige. No numeric rates reported in the abstract.
- Relevance: gives the canonical form/function taxonomy for mixed Indonesian-English utterances that the prompt builder can classify user turns against.

### 3.2 Bhinneka (Instagram, 2026)

- Title: "Alih Kode dan Campur Kode dalam Interaksi Digital Generasi Z Indonesia: Kajian Sosiolinguistik pada Media Sosial Instagram"; authors Muhammad Nurahmad (Universitas Muhammadiyah Makassar) and Nurasia Natsir (Institut Ilmu Kesehatan Pelamonia); Bhinneka: Jurnal Bintang Pendidikan Dan Bahasa Vol. 4 No. 3 (2026), published 2026-06-30; DOI 10.59024/bhinneka.v4i3.1811.
- Method: sociolinguistic approach with virtual ethnography; 1,200 posts and comments, January–June 2024, plus in-depth interviews; platform Instagram.
- Numbers as reported by the abstract:
  - Code-switching present in 68.4% of data; type split: intrasentential 47.3%, intersentential 38.6%, tag/external 14.1%.
  - Code-mixing present in 82.1% of data; insertions: English into Indonesian 63.2%, regional languages (Javanese, Sundanese, Betawi) 27.1%.
  - Drivers: social identity, community affiliation, communicative efficiency, emotional expression, audience context.
- Relevance: even at 2% raw English tokens (our corpus), English insertions carry identity/efficiency signaling — the bot should know the forms even though it uses them sparingly; regional-language insertions exist and the bot may recognize (not produce) Javanese/Sundanese/Betawi bits.

---

## 4. Humor and persona

### 4.1 Humor culture

- Search-surfaced Indonesian coverage frames "brainrot" memes (Skibidi Toilet, Tung Tung Sahur) as a Gen Alpha phenomenon adjacent to Gen Z, and documents that each generation has distinct humor styles (titles listed in §1; not opened).
- The corpus shows this group's humor is: banter/roast (mandul, trash talk before/after spar), absurd one-liners with jir/wok interjections, the deadpan 🗿 reaction, and TikTok-link sharing as inside jokes.
- Design stance for Omak: roast-first persona with a hard truth boundary — jokes must be grounded in what actually happened (chat context, match results, activity), never invented accusations; rage-bait is throttled by explicit limits (see social-intelligence design); brainrot references allowed as garnish, not as the core voice (wrong generation, and would read as try-hard).

### 4.2 Persona design principles (industry sources)

- Zendesk recommends an AI agent be assertive when gathering information and empathetic after a bad customer experience (search snippet; URL in §1).
- NiCE's guide covers persona/tone frameworks, repair patterns, and testing the hard moments of a conversation (search snippet; URL in §1).
- Adopted for Omak: one fixed persona (no tone switching between users); short turns with register matching (§2.7); repair strategy when a roast lands wrong (acknowledge, dial down, move on); cooldowns so the bot never out-talks the human core (top-10 = 94.8% of messages); the bot never claims to be human and states it is a bot when asked directly.

---

## 5. Baileys v7 (WhatsApp layer)

### 5.1 Versioning and runtime

- Package: `@whiskeysockets/baileys`. npm dist-tags verified 2026-11-23: `latest` = **7.0.0-rc14**, `legacy` = 6.7.24. The v7 line is an RC series but is what npm tags as latest → pin the exact version, treat it as the production target.
- Node.js: "You need **Node.js 20.0.0 or later**" (installation page); enforced by a `preinstall` check. The repo itself uses Yarn 4/Corepack internally — irrelevant for consumers.
- ESM: "Baileys 7.x is ESM-only." → this project uses `"type": "module"`; CommonJS consumers would need dynamic `import()`.

### 5.2 LIDs (Linked Identity JIDs)

- WhatsApp finalized LID rollout in 2024. A LIDJID (`@lid`, anonymizes phone numbers in large groups) coexists with legacy PNJID (`@s.whatsapp.net`); a LID is unique per user, not per group.
- Resolution is one-way PN → LID. `onWhatsApp()` no longer returns LIDs; use `getLIDForPN` / `getLIDsForPNs`; reverse lookup `getPNForLID` only resolves previously cached pairs.
- Mapping store: `sock.signalRepository.lidMapping` with `storeLIDPNMapping(s)`, `getLIDForPN(s)`, `getPNForLID`.
- MessageKey gained `remoteJidAlt` (DMs) and `participantAlt` (groups/broadcasts/channels) in 6.8.0 — each holds the alternate JID (PN ↔ LID).
- GroupMetadata: `owner` is a LID with `ownerPn` holding the PN form (same pattern for `descOwner`/`descOwnerPn` and participants).
- Contact type: separate `jid`/`lid` fields removed; `id` is the preferred identifier, `phoneNumber` filled when `id` is a LID and `lid` when `id` is a PN. `isJidUser` is removed in favor of `isPnUser`.
- New: `lid-mapping.update` event ("this is not always emitted yet") and `WAMessageAddressingMode`.
- Guidance: "Don't try to 'restore' PN JIDs." — Omak must store and compare LIDs as the primary identifier, keep the PN mapping in our own DB (participant resolver), and always read the `*Alt` fields for the other form.

### 5.3 Auth state and session migration

- "The LID system requires your auth state to support the `lid-mapping`, `device-list`, and `tctoken` keys." Custom auth implementations must be checked against `SignalDataTypeMap` before upgrading.
- Existing sessions are migrated automatically to LID format — no manual migration steps are documented.
- Omak implements a custom auth store (Turso-backed, encrypted at the application layer) → it must persist **every** category of `SignalDataTypeMap`, including the three keys above, not just `creds`/`session`.

### 5.4 Removed ACKs and protobuf changes

- "Baileys 7.x stops sending acknowledgments on successful message delivery." Reason given: "WhatsApp has been banning accounts that send these." → never manually send ACKs; delivery tracking must not depend on ack events.
- Proto helpers removed: use `.create()` instead of `.fromObject()`; `.encode()`/`.decode()` remain; prefer `decodeAndHydrate()` over plain `decode()`.
- Serialization must use the `BufferJSON` utilities — plain `JSON.stringify`/`JSON.parse` "will corrupt buffer fields." This directly affects how we persist message/session blobs (wrap with BufferJSON revive/replace).

### 5.5 Optional peer dependencies

- `sharp` (faster, recommended over `jimp` — pick one) for thumbnails; `ffmpeg` (system package) for video thumbnails; `link-preview-js` optional; `audio-decode` for some audio ops. Docs advise "For most projects, start without any peer dependencies." Omak adds `sharp` for sticker/media processing; `ffmpeg` is installed in the Docker image if video support is enabled.

---

## 6. Turso (database layer)

### 6.1 Client choice

- Four documented packages: `@tursodatabase/database` (embedded/local, native+WASM), `@tursodatabase/sync` (local-first sync), `@tursodatabase/serverless` (remote, fetch-only, zero native deps), `@libsql/client` (remote libSQL; "the package to use for ORM integration (Drizzle, Prisma)").
- The serverless package is now described as the recommendation for remote Turso Cloud connections; it offers a `@tursodatabase/serverless/compat` entry exposing the `createClient` API.
- **Decision:** Omak uses `@libsql/client`. Rationale: supports both `libsql://` (remote) and `file:` (local file for tests/dev) from one API, battle-tested, and it is the integration package the docs still publish. Revisit if Turso deprecates it in favor of `@tursodatabase/*`.

### 6.2 API surface (verified)

- `createClient({ url, authToken })`; URL schemes: `libsql://` remote, `file:` local, `:memory:`.
- `execute(sql | { sql, args })` → `ResultSet { rows, columns, rowsAffected, lastInsertRowid }`.
- Placeholders: `?` positional, and named `:name` / `@name` / `$name`.
- `batch(statements, "write")`: runs sequentially inside an implicit transaction, all-or-nothing. Modes: `write` (≈ `BEGIN IMMEDIATE`), `read` (readonly, parallel-safe on replicas), `deferred`.
- `transaction("write")` → interactive tx with `execute/commit/rollback/close`; warning: interactive transactions lock writes and can time out after 5 s — prefer `batch()` for multi-statement writes.
- Default concurrency up to 20 requests; Node.js ≥12 supported.

### 6.3 Metering and schema implications

- Rows **read** are actually row **scans**: queries without index support trigger full-table scans billed per row; aggregates scan every considered row; creating an index on an existing table scans that table once; even `select 1` counts one read.
- Rows **written**: every insert and update counts, including rows touched before an aborted transaction's rollback.
- Storage is measured via SQLite `dbstat` in 4 KB pages; `VACUUM` is "currently disabled in Turso."
- Exceeding quota → queries fail with the `BLOCKED` error code.
- Consequences for Omak:
  1. Define every index at table creation (never retrofit on a large table).
  2. All hot queries indexed by (jid, timestamp); always `LIMIT` and paginate.
  3. Message retention/pruning is mandatory (unbounded chat history = unbounded scan cost and storage).
  4. Auth-store writes use `batch()` to keep the many session keys atomic.
  5. Track schema version in a `_schema_version` table (see 6.4), not pragmas.

### 6.4 Turso-specific limitations

- `pragma user_version` is read-only on Turso Cloud: "Use a `_schema_version` table instead to track schema migrations." → Omak's migration runner reads/writes `_schema_version(version INTEGER)`.
- `pragma application_id` is read-only → app metadata goes into a `_metadata` table.
- `pragma busy_timeout` and `pragma journal_mode` are not supported (Turso manages concurrency/journaling internally) → do not set them in code.

### 6.5 Plans/quotas

- Starter and Scaler plans exist; both are metered monthly on rows read, rows written, and storage. Concrete quota numbers (free storage GB, row quotas) are not printed on the docs page fetched → verify from the Turso console/plan API before cost-tuning; do not hardcode assumptions.

---

## 7. Koyeb (deployment)

### 7.1 Ephemeral storage — the driving constraint

- "Local storage is ephemeral. This means that all data written on the local filesystem of a running Service might be lost at any moment."
- Instance rescheduling (automatic upgrades, "at least on a weekly basis") does not carry local data over.
- Consequence: Baileys credentials, sticker packs, and any cache cannot live only on disk. Omak persists the encrypted auth store in Turso; stickers are stored as DB blobs + re-hydrated to a temp dir at boot; local disk is used strictly for temporary media processing.
- Local storage is explicitly "perfect for caches or temporary data that needs high performance" — that is exactly how we treat it.

### 7.2 Volumes — evaluated and rejected

- "Volumes are in public preview and are currently only suitable for testing."
- 1–10 GB only; regions `was` and `fra` only; cannot attach to `eco-*` or `free` instances; "Volumes currently only work with Services with a scale of one"; once attached, a volume cannot be detached without deleting the service; redeploy causes downtime while the volume moves.
- Decision: not adopted — DB-backed persistence (Turso) is more portable and matches the free/eco instance class we target.

### 7.3 Environment variables and secrets

- "Koyeb Web Services always have a `PORT` variable defined"; if unset it is auto-set to the lowest exposed port → Omak's HTTP server listens on `process.env.PORT`.
- Injected vars include `KOYEB_APP_NAME`, `KOYEB_SERVICE_NAME`, `KOYEB_REGION`, `KOYEB_INSTANCE_ID`, `KOYEB_INSTANCE_TYPE` — useful for logs and one-instance enforcement.
- Secrets are referenced by interpolation `{{ secret.NAME }}` (values never appear inline); bulk edit format `NAME=VALUE`; CLI: `koyeb service update APP/SERVICE --env "NAME=VALUE"`.

### 7.4 Health checks

- Default probes are TCP on exposed ports; HTTP probes are configurable with: path (must return 2xx/3xx), method (default GET), headers, grace period (default 5 s, range 5–900), interval (default 60 s, range 30–300), restart limit (default 3, range 1–10), timeout (default 5 s, range 1–600).
- Readiness: all checks must pass before a new deployment receives traffic; until then the previous healthy deployment keeps serving. Liveness failures restart instances after the restart limit.
- Omak plan: HTTP liveness at `/healthz` (process alive, no WhatsApp dependency) and readiness gated on DB connectivity + WhatsApp connection state; grace period ≥ 60 s to allow WhatsApp (re)connect after boot.

### 7.5 Topology

- Exactly one service instance (scale 1): a second instance would run a second WhatsApp session with the same credentials → conflict/ban risk. Graceful shutdown (SIGTERM) must disconnect cleanly so redeployments do not leave orphaned sessions.

---

## 8. Open questions / not found

1. Baileys docs do not label v7 "stable" vs "release candidate"; npm's `latest` tag points at 7.0.0-rc14. Treat RC as production, pin exact, and gate deploys on connection smoke tests.
2. Turso plan quota numbers were not on the docs pages fetched — confirm in the Turso console or plan API before tuning retention windows.
3. Baileys Node minimum is documented on the installation page (≥20), not on the migration page.
4. The two persona/humor industry sources (Zendesk, NiCE) were reviewed via search snippets only; open them fully during the personality-guide task if more depth is needed.
