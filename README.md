# Omak

AI companion bot for WhatsApp groups — designed for the AVOID PRIME | FT community
(Indonesian Gen Z, eFootball gaming banter). Built on Baileys v7, Turso (libSQL), and
deployed to Koyeb.

## Status

Feature-complete for the first release. 117 tests green, lint/typecheck/build clean,
`npm audit` clean. The research grounding lives in
[docs/research/research-findings.md](docs/research/research-findings.md).

## Stack

- **Runtime**: Node.js >= 22, TypeScript 6, ESM-only (Baileys 7.x requirement)
- **WhatsApp**: `@whiskeysockets/baileys` 7.0.0-rc14 (LID-aware, ESM-only, no manual ACKs)
- **Database**: Turso Cloud via `@libsql/client` — versioned migrations (`_schema_version`),
  encrypted Baileys auth store, FTS5-backed long-term memory, DB-stored sticker blobs
- **AI**: provider adapters (OpenAI-compatible / Anthropic / Gemini) behind a fallback
  router, with usage tracking and a daily call quota
- **Hosting**: Koyeb, scale 1, `/healthz` + `/readyz` on `$PORT`

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
| `!sticker add <nama>` | admin | turn a recently sent image/sticker into a sticker |
| `!sticker list` / `!sticker del <nama>` | admin | manage the pack |
| `!memory list` / `!memory del <id>` | admin | inspect long-term memory |

Single-token messages that equal a sticker name or tag send that sticker (`🗿`, `gas`, ...).

## Documentation

| Doc | Content |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | system overview, component map |
| [docs/architecture-message-flow.md](docs/architecture-message-flow.md) | burst → decision → reply pipeline |
| [docs/architecture-data.md](docs/architecture-data.md) | schema, migrations, retention, Turso cost model |
| [docs/personality.md](docs/personality.md) | persona, humor rules, truth boundary |
| [docs/language-profile.md](docs/language-profile.md) | community register, derived style rules |
| [docs/deploy-koyeb.md](docs/deploy-koyeb.md) | Koyeb deployment runbook |
| [docs/deploy-turso.md](docs/deploy-turso.md) | Turso setup + quotas |
| [docs/security.md](docs/security.md) | threat model, secrets, data handling |
| [docs/research/research-findings.md](docs/research/research-findings.md) | research grounding |

## Source layout

| Path | Purpose |
| --- | --- |
| `src/config` | zod-validated environment schema |
| `src/db` | client, migrations, repos (messages, groups, memories, stickers, ai_usage) |
| `src/whatsapp` | socket lifecycle, normalization, dedupe, burst collector, media |
| `src/ai` | provider adapters, router, usage tracking, validator, prompt builder |
| `src/memory` | short-term store, extraction, summarizer, retrieval, retention |
| `src/social` | participation, context analyzer, rage-bait limiter, roasts, starters, orchestrator |
| `src/stickers` | webp processing, manager |
| `src/commands` | `!command` registry and builtins |
| `src/scheduler` | retention / summarizer / starter tasks |
| `src/http` | `/healthz`, `/readyz` |
