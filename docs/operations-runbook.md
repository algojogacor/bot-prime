# Operations runbook — Omak (Bot Prime)

Day-2 operations for the WhatsApp bot: startup, pairing, modes, dataset
maintenance, database care, and troubleshooting. Deployment steps live in
[deploy-koyeb.md](deploy-koyeb.md); Turso setup in [deploy-turso.md](deploy-turso.md).

## 0. Deploy on the Azure VM (GitHub-first)

1. Branch, commit, push; open a PR; let CI (or, when the GitHub account's
   Actions are locked, the equivalent local gate: `tsc --noEmit`,
   `eslint .`, `vitest run`, `tsc -p tsconfig.build.json`) pass; merge.
2. On the VM, from a clone with `origin` set:
   `bash scripts/ops/deploy-from-github.sh <full-merged-sha>` — it verifies
   the SHA equals `origin/main`, builds, backs up the live deploy (dist,
   bot.db, .env, package.json) into `bot-prime-backups/`, swaps the code,
   repairs any mis-stamped timestamps, and restarts PM2.
3. Verify: `/healthz` and `/readyz` on the health port, `pm2 logs bot-prime`
   (migration applied, gateway connected), `DEPLOYED_SHA` == the merged SHA.
4. Optional AI-path smoke tests without touching WhatsApp:
   - `scripts/ops/e2e-check.ts` — full orchestrator reply path (against a
     COPY of bot.db).
   - `scripts/ops/provider-e2e.ts` — direct generate() against every
     configured provider with the real key pools, plus a failover drill
     (simulated dead groq+gemini must be answered by nvidia). NOTE: a
     provider can legitimately fail its direct test when ITS quota is
     exhausted at that moment (the shared Gemini key does this) — the drill
     is what proves the chain still answers.

## 1. Start / stop

```bash
npm run dev            # local dev (tsx watch)
npm ci && npm run build && npm start   # production-style local run
```

- On first start the bot logs a **QR** line — scan it from WhatsApp
  (Linked devices), or set `OMAK_PAIRING_NUMBER` (digits only) to receive a
  **pairing code** in the logs instead.
- `SIGTERM`/`SIGINT` trigger a graceful shutdown: scheduler stops, burst buffers
  flush, the socket closes, and the **ownership lease is released**.

## 2. Single-instance fencing

Only one process may hold the WhatsApp socket. Ownership is a DB lease
(`instance_lease`, TTL 60 s, heartbeat ~20 s):

- A second instance waits up to 120 s for the lease, then exits with
  `another instance holds the WhatsApp socket lease`.
- After a crash, the stale lease expires within 60 s and the new instance takes over.
- Manual override (only when sure no other instance runs):
  `DELETE FROM instance_lease;` on the Turso database.

## 3. Group controls (persisted per group)

| Command | Effect |
| --- | --- |
| `!prime mode passive` | mentions + quoted replies only (no ambient, no starters) |
| `!prime mode balanced` | default: ambient 4%, starters allowed |
| `!prime mode active` | ambient 12%, 5 s gap, starters allowed |
| `!prime pause` / `!prime resume` | kill-switch for autonomous participation (commands still work) |
| `!prime config` | effective settings + dataset index status |

Settings are cached ~30 s — changes take effect within that window and survive
restarts (stored in `group_settings`).

## 4. Commands cheat-sheet

`!ping` · `!stats` · `!ai <tanya>` · `!ai lore [topik]` · `!ai status` ·
`!ai ejek <nama>` · `!ai help` · `!sticker add|list|del` (admin) ·
`!memory list|del` (admin) · `!prime mode|pause|resume|config` (admin).

Admins are configured via `OMAK_ADMIN_JIDS` (PN or LID form; matching is
digit-loose so both resolve).

## 5. Dataset maintenance

- Integrity (fast, CI-safe): `npm run dataset:verify`
- Full regeneration (proven byte-identical):
  `bash scripts/dataset/run_all.sh "data/source/WhatsApp Chat with AVOID PRIME  FT.txt" data/seed`
- New export → replace the file in `data/source/`, re-run the pipeline, commit
  both the new source and regenerated seed (see `docs/audit/community-dataset-audit.md`
  for the methodology that must stay stable).
- Lore curation: edit `scripts/dataset/lore-curated.json` (citations must be real
  msg ids — stage 5 verifies), then re-run stages 5–7.

## 6. Database care (Turso)

- Migrations are forward-only and idempotent; current version: 7
  (`messages-push_name`). Never edit applied migrations.
- Backup: `turso db export <db> > backup.sql` (or platform snapshots) before
  schema changes; restore by creating a fresh DB and importing, then update
  `TURSO_DATABASE_URL`.
- Quota guard: AI calls are capped by `OMAK_MAX_DAILY_AI_CALLS` via the
  `ai_usage` table; sticker blobs live in `blobs` (image weight) — prune with
  `!sticker del`.
- If Turso is down, the bot degrades: AI quota checks fail soft (0 used),
  memory reads return empty — the socket keeps running.

## 7. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Bot silent in all groups | `!prime pause` state, or `logged_out` (re-pair: clear auth, scan QR) |
| `another instance holds the WhatsApp socket lease` | overlap — wait 60 s; or remove the lease row (§2) |
| Repeated replies to the same message | check `dedupe` capacity warnings; restart clears the in-memory LRU |
| AI replies stop after quota hit | expected; resets at UTC midnight, or raise `OMAK_MAX_DAILY_AI_CALLS` |
| `arsip komunitas ga kebaca` from `!ai status` | `data/seed` missing/corrupt in the image — check the Dockerfile COPY and `OMAK_SEED_DIR` |
| Provider outage | router falls through `AI_FALLBACK_ORDER`; grounded local roasts still work |
| Koyeb restart loop before pairing | expected: `/healthz` stays 200, `/readyz` is 503 until connected; do NOT wire liveness to `/readyz` |

## 8. Rollback

Redeploy the previous image (Koyeb keeps prior deployments); the DB schema is
backward-compatible at every point (forward-only migrations, no destructive
changes between versions 1–6). If a bad dataset regen was pushed, revert the
commit — both `data/source` and `data/seed` are regular git content.

## 9. Known operational limits

- Baileys `7.0.0-rc14` is a release candidate: pin it, watch for stable 7.x.
- Scale must stay 1 (single socket lease); multi-replica needs the lease TTL
  honored per replica plus message-sharding design — not implemented.
- The community index is lexical (FTS5); vector search is a future layer behind
  `semantic-index.jsonl`, not deployed.
