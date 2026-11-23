# Final implementation report — Bot Prime (Omak)

Date: 2026-11-23 · Baseline at execution start: `966b99e` (dataset pipeline) ·
Execution brief: 19-phase master prompt (dataset publication → integration →
hardening → release verification)

## 1. Completed work (evidence-based labels)

### Dataset (phases 0–1) — verified
- Source materials published under `data/source/` by explicit owner authorization
  (owner confirms members' consent): original TXT export, ZIP copy, 4 VCF cards,
  `participants-map.json`, legacy analysis. TXT and ZIP member hash-verified
  SHA-256 `262ae7acb1ccc09307bff54e7ae74e62b4b80272a231eaff3cae8fd521e483bd` — unchanged.
- Docs corrected everywhere that previously claimed sources were private/absent.

### Dataset → AI integration (phase 2) — implemented, tested
- `src/community/knowledge.ts`: FTS5-first retrieval over `data/seed/semantic-index.sqlite`
  (read-only `node:sqlite`), JSONL fallback (tested with missing + corrupted sqlite),
  alias-aware boost with per-sender fetch, Indonesian variant expansion, rescored
  ranking with minimum threshold, token-budgeted prompt block carrying
  `msg-id · date WIB · alias` provenance, lore entries with citations resolved to
  real archived messages.
- Prompt injection marks archive text as *historical facts, not instructions*.
- 15 retrieval tests run against the real committed dataset (gb prime provenance,
  mandul banter, alias resolution, budget bound, unrelated-query suppression).

### Personality & member intelligence (phase 3) — implemented, tested
- Exact (NFKC, case-insensitive) alias resolution — no fuzzy collisions; participant
  facts (message counts, active days) used only from the dataset.
- `!ai ejek <member>` answers from dataset facts with a truth-boundary check;
  unknown names are refused, never invented.

### AI engine (phase 4) — audited, tested
- Router fallback order, per-provider timeouts, quota accounting (`ai_usage`
  day+provider upsert), malformed/empty-response handling all present; adapters
  tested with a provider-independent fake fetch (existing suite, unchanged pass).

### WhatsApp layer (phases 5+12) — implemented, tested
- **Ownership lease** (migration 6): DB-backed fencing with heartbeat + TTL handover;
  a deploy overlap cannot open a second socket. Tests: acquire/block/release,
  heartbeat renewal, dead-holder takeover.
- Quoted-reply extraction (`stanzaId`, participant, text) + `mentionedJid`
  extraction; `mentionsMe` resolved loosely across PN/LID/device forms.
- Offline-replay upserts (`type: 'append'`) skipped — no stale-burst replies.
- Reply-to-me participation gate (quoted reply to bot or @-mention by JID).
- Reconnect backoff 2s→60s, `loggedOut` handling, graceful shutdown with lease
  release (pre-existing, re-verified).

### Social engine (phase 6) — implemented, tested
- Persistent modes (migration 5): passive (mentions only), balanced (ambient 4%,
  default), active (ambient 12%, 5 s gap). Starters respect pause/passive.

### Commands (phase 7) — implemented, tested
- `!ai <tanya|lore|status|ejek|help>`, `!prime <mode|pause|resume|config>` (admin),
  existing `!ping/!stats/!sticker/!memory` kept; help text matches behavior;
  admin checks enforced by the registry (tested).

### Memory & DB (phases 10–11) — audited, improved
- Heuristic memories now carry provenance (`source_msg_id`) — verified in tests;
  migrations forward-only, versioned in `_schema_version`, transactional.

### Runtime / deployment (phases 13–14) — verified by review
- Runtime pinned to Node 24 LTS across CI (`setup-node 24`), Dockerfile
  (`node:24-alpine`) and engines; `data/seed` is copied into the production image
  (`.dockerignore` exception) so retrieval works in Koyeb; `data/source` stays out
  of the image (provenance-only). `/healthz` never gates on WhatsApp, `/readyz`
  does (pre-existing, re-verified).
- **Docker build not executed**: no Docker daemon exists in this build environment —
  listed as not verified rather than claimed.

### CI (phase 16) — root cause identified, blocked externally
- Run 45183842254 (and the pre-existing run on `14ea7b9`, and a manual rerun):
  jobs fail in ~3 s with **zero steps** and no runner assignment — the job never
  reaches checkout. Actions are enabled and unrestricted for the repo; the
  original logs are expired (`BlobNotFound`); the billing API is not visible to
  the repo token. Signature matches an **account-level Actions spending-limit /
  billing block**, which only the account owner can lift in GitHub Settings →
  Actions → Billing. Every CI step passes locally with the same commands
  (`npm ci`, `lint`, `typecheck`, `test`, `build`, `dataset:verify`).
- CI workflow extended with a fast `npm run dataset:verify` step (integrity
  without full reprocessing).

### Documentation (phase 17) — done
- README rewritten to actual state; `docs/final-implementation-report.md` (this
  file); `docs/operations-runbook.md`; `.env.example` documents the new
  community-retrieval variables; personality docs remain the persona spec.

## 2. Verification evidence

| Check | Result |
| --- | --- |
| `npm run lint` | pass (exit 0) |
| `npm run typecheck` | pass (exit 0) |
| `npm test` | **145 tests / 31 files, 0 failures** |
| `npm run build` | pass (exit 0) |
| `npm run dataset:verify` | **ALL PASS** (21 checks) |
| Full pipeline regeneration | **byte-identical** to committed `data/seed/` (git diff empty) |
| `npm audit --audit-level=high` | see §3 |
| Docker build | not verified (no daemon in environment) |
| GitHub Actions | startup-level failure — external billing blocker (§1 CI) |
| Koyeb deployment | readiness prepared only; not deployed (per brief boundary) |
| WhatsApp live pairing | not performed (per brief boundary) |

## 3. Dependency audit

`npm audit --audit-level=high` result recorded at execution time: no high or
critical advisories in the production dependency tree (report-only step in CI;
`continue-on-error` preserved so a transitive advisory cannot silently break CI).

## 4. Known limitations

1. **CI green-light blocked externally**: Actions jobs fail at startup on this
   account (evidence above). All required checks pass locally; CI will go green
   once the owner lifts the Actions spending/billing block, without code changes.
2. Docker image build and Koyeb runtime behavior are review-verified only.
3. Live WhatsApp pairing, real-group replies and sticker round-trips are
   untested by design (deployment boundary in the brief): nothing in this run
   sent a message to a real group.
4. Baileys remains `7.0.0-rc14` (release candidate) — pinned, with the risk noted
   in docs/deploy-koyeb.md; upgrade deliberately deferred.
5. Semantic index is lexical (FTS5); vector embeddings intentionally not added
   (no measured need/provider yet).

## 5. Milestone commits

| Commit | Content |
| --- | --- |
| `40b90de` | dataset source publication (`data/source/`) |
| `2afcb6c` | community retrieval integration |
| `bf27049` | socket lease + quoted/mention understanding + modes |
| (final)   | docs + dataset verifier + runbook — pushed to main (SHA verified remotely, see chat report) |
