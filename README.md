# Omak

AI companion bot for WhatsApp groups — designed for the **AVOID PRIME | FT** community
(inside the WhatsApp community **AVOID CITY**; Indonesian Gen Z, eFootball gaming
banter). Built on Baileys v7, Turso (libSQL), and deployed to Koyeb.

## Status

Feature-complete for the first release. Evidence-based state:

- **145 tests / 31 files green** (Vitest), lint, typecheck and build clean locally
- `npm run dataset:verify` — ALL PASS (source hash + artifact integrity)
- **Dataset reproducibility proven**: a full `scripts/dataset/run_all.sh` re-run from
  the committed source regenerates `data/seed/` **byte-identical** (git diff empty)
- Community-dataset retrieval is integrated into the live AI pipeline
- Docker image build **not verified locally** (no Docker daemon in the build
  environment); Dockerfile is aligned with CI (node:24) and reviewed
- GitHub Actions runs fail at job startup (~3 s, zero steps — an account-level
  Actions/billing issue, not code; all steps pass locally). See
  [docs/final-implementation-report.md](docs/final-implementation-report.md).

## Stack

- **Runtime**: Node.js 24 (LTS, aligned across CI, Dockerfile and docs), TypeScript, ESM-only
- **WhatsApp**: `@whiskeysockets/baileys` 7.0.0-rc14 — LID-aware, DB-backed auth,
  ownership lease (single socket across deploy overlaps), quoted-reply and
  @-mention understanding, offline-replay filtering
- **Database**: Turso via `@libsql/client` — versioned forward-only migrations,
  FTS5 long-term memory with provenance (`source_msg_id`), sticker blobs, per-group
  settings (mode/pause persist across restarts)
- **Community knowledge**: static seed artifacts in `data/seed/` (FTS5 sqlite +
  JSONL) read read-only via `node:sqlite` — never imported into Turso
- **AI**: OpenAI-compatible / Anthropic / Gemini adapters behind a fallback router,
  usage accounting, daily quota, truth-boundary validation
- **Hosting**: Koyeb, scale 1, `/healthz` (liveness) + `/readyz` (readiness)

## Dataset

The full community dataset is committed in this repository by explicit owner
authorization (2026-11-23; the owner confirms members granted permission):

| Path | Content |
| --- | --- |
| `data/source/` | original WhatsApp export (SHA-256 `262ae7ac…`), ZIP copy, VCF cards, participant alias map, legacy analysis |
| `data/seed/` | 79,090 normalized records, participants (25), statistics, language profile, lore (10 entries, citation-verified), summaries, FTS5 semantic index (71,302 rows), quality report |

```bash
npm run dataset:verify                                        # integrity check (CI)
bash scripts/dataset/run_all.sh                               # full regeneration (byte-identical)
```

Identity note: the archive is AVOID PRIME | FT; "GB Prime" is a colloquial
reference to *Grup Besar Prime* within the same ecosystem — see
[docs/audit/community-dataset-audit.md](docs/audit/community-dataset-audit.md).

## Quickstart

```bash
npm install
cp .env.example .env   # fill in real values; never commit .env
npm run dev            # first run: scan the QR, or set OMAK_PAIRING_NUMBER
```

## Commands (in group chat)

| Command | Who | What |
| --- | --- | --- |
| `!ping` | everyone | liveness check |
| `!stats` | everyone | uptime, AI calls today, sticker count |
| `!ai <pertanyaan>` | everyone | AI answer with live + archive context |
| `!ai lore [topik]` | everyone | community lore, citation-backed |
| `!ai status` | everyone | dataset/index status + usage |
| `!ai ejek <nama>` | everyone | short grounded roast (dataset facts only) |
| `!ai help` | everyone | command help |
| `!prime mode passive\|balanced\|active` | admin | participation mode (persisted, ~30 s TTL) |
| `!prime pause` / `!prime resume` | admin | pause/resume autonomous participation (persisted) |
| `!prime config` | admin | show effective settings |
| `!sticker add <nama>` / `list` / `del` | admin | manage the pack |
| `!memory list` / `!memory del <id>` | admin | inspect long-term memory |

Single-token messages that equal a sticker name or tag send that sticker. The bot
answers quoted replies to itself and real @-mentions; passive mode = mentions
only, balanced = ambient 4%, active = ambient 12% with a shorter gap.

## Documentation

| Doc | Content |
| --- | --- |
| [docs/final-implementation-report.md](docs/final-implementation-report.md) | implementation status + evidence |
| [docs/operations-runbook.md](docs/operations-runbook.md) | operate, pair, troubleshoot, roll back |
| [docs/audit/community-dataset-audit.md](docs/audit/community-dataset-audit.md) | dataset audit + old-vs-new reconciliation |
| [docs/personality.md](docs/personality.md) | persona, humor rules, truth boundary |
| [docs/personality/community-language-profile.md](docs/personality/community-language-profile.md) | canonical corpus-derived profile |
| [docs/personality/community-lore.md](docs/personality/community-lore.md) | in-group lore with msg-id citations |
| [docs/architecture.md](docs/architecture.md) | system overview, component map |
| [docs/architecture-message-flow.md](docs/architecture-message-flow.md) | burst → decision → reply pipeline |
| [docs/architecture-data.md](docs/architecture-data.md) | schema, migrations, retention, Turso cost model |
| [docs/deploy-koyeb.md](docs/deploy-koyeb.md) | Koyeb deployment runbook |
| [docs/deploy-turso.md](docs/deploy-turso.md) | Turso setup + quotas |
| [docs/security.md](docs/security.md) | threat model, secrets, data handling |
| [docs/research/research-findings.md](docs/research/research-findings.md) | research grounding |

## Source layout

| Path | Purpose |
| --- | --- |
| `src/config` | zod-validated environment schema |
| `src/db` | client, migrations, repos (messages, groups, settings, memories, stickers, ai_usage) |
| `src/whatsapp` | socket lifecycle + lease, normalization, dedupe, burst collector, media |
| `src/community` | read-only retrieval over the committed dataset (FTS5/JSONL, aliases, lore) |
| `src/ai` | provider adapters, router, usage tracking, validator, prompt builder |
| `src/memory` | short-term store, provenance-carrying extraction, summarizer, retrieval, retention |
| `src/social` | participation modes, context analyzer, rage-bait limiter, roasts, starters, orchestrator |
| `src/stickers` | webp processing, manager |
| `src/commands` | `!command` registry and builtins |
| `src/scheduler` | retention / summarizer / starter tasks |
| `src/http` | `/healthz`, `/readyz` |
| `scripts/dataset` | 7-stage reproducible pipeline + integrity verifier |
