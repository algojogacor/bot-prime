# Omak

AI companion bot for WhatsApp groups — designed for the AVOID PRIME | FT community
(Indonesian Gen Z, eFootball gaming banter). Built on Baileys v7, Turso (libSQL), and
deployed to Koyeb.

## Status

In active development — scaffold phase. The research grounding behind the design lives in
[docs/research/research-findings.md](docs/research/research-findings.md).

## Stack

- **Runtime**: Node.js >= 22, TypeScript 6, ESM-only (Baileys 7.x requirement)
- **WhatsApp**: `@whiskeysockets/baileys` 7.0.0-rc14 (LIDs, ESM-only, no manual ACKs)
- **Database**: Turso Cloud via `@libsql/client` — versioned migrations (`_schema_version`),
  encrypted Baileys auth store (Koyeb's local disk is ephemeral, so nothing lives on disk)
- **Hosting**: Koyeb, scale 1, HTTP health endpoints on `$PORT`
- **Tooling**: eslint (flat config), prettier, vitest

## Quickstart

```bash
npm install
cp .env.example .env   # fill in real values; never commit .env
npm run dev
```

## Source layout

| Path | Purpose |
| --- | --- |
| `src/config` | Environment schema, feature flags |
| `src/db` | Turso client, migrations, repositories *(planned)* |
| `src/whatsapp` | Connection, normalization, participant resolver, senders *(planned)* |
| `src/ai` | Provider adapters, router/fallback, prompt builder *(planned)* |
| `src/memory` | Short/long-term memory, retrieval, retention *(planned)* |
| `src/social` | Participation engine, personality, roasting limits *(planned)* |
| `src/stickers` | Sticker pack manager, media processing *(planned)* |
| `src/http` | Health endpoints `/healthz`, `/readyz` *(planned)* |
| `docs/research` | Research findings |
