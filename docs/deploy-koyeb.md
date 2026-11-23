# Deploying to Koyeb

Constraints discovered in research (docs/research/research-findings.md §7):

- local disk is ephemeral and instances are rescheduled at least weekly → **all state
  lives in Turso**;
- volumes are public-preview, region-locked, and not attachable to free/eco instances
  → not used;
- `PORT` is always injected → the app listens on it;
- a WhatsApp session must never run twice → **scale 1 only**.

## One-time setup

1. Create the Turso database and token (see deploy-turso.md).
2. Generate the auth encryption key: `openssl rand -base64 32`.
3. Create a Koyeb Service from the GitHub repo (`algojogacor/bot-prime`, main branch,
   Dockerfile runner).
4. Environment variables (Settings → Environment variables and files; secrets via
   `{{ secret.NAME }}` interpolation or bulk edit `NAME=VALUE`):

   ```
   NODE_ENV=production
   LOG_LEVEL=info
   TURSO_DATABASE_URL={{ secret.TURSO_DATABASE_URL }}
   TURSO_AUTH_TOKEN={{ secret.TURSO_AUTH_TOKEN }}
   AUTH_ENCRYPTION_KEY={{ secret.AUTH_ENCRYPTION_KEY }}
   AI_PROVIDER=openrouter
   AI_API_KEY={{ secret.AI_API_KEY }}
   AI_MODEL={{ secret.AI_MODEL }}
   AI_FALLBACK_ORDER=openai,gemini
   OMAK_ADMIN_JIDS=62812...@s.whatsapp.net
   ```

   CLI equivalent: `koyeb service update <app>/<service> --env "KEY=VALUE"`.

## Health checks (Koyeb settings)

| Probe | Path | Notes |
| --- | --- | --- |
| Startup/readiness | HTTP `/readyz` | 200 only when DB reachable + WhatsApp connected |
| Liveness | HTTP `/healthz` | 200 whenever the process is alive |

Recommended: grace period 60 s (WhatsApp (re)connect takes a few seconds; range is
5–900 s), interval 60 s, timeout 5 s, restart limit 3. Do not let the liveness probe
depend on WhatsApp — a re-pair wait would restart-loop the instance.

## First pairing

- With `OMAK_PAIRING_NUMBER` set (digits, no `+`), the first boot logs a pairing code
  — enter it on the phone. Otherwise read the QR from the logs and scan it.
- After `connection.update: open`, `/readyz` turns 200 and Koyeb starts routing.
- The session persists in Turso (`auth_keys`, encrypted); redeploys reconnect without
  re-pairing. If WhatsApp logs the session out, the store is wiped automatically and
  the next boot asks to pair again.

## Operational rules

- **Never** scale beyond 1 instance (second session with the same credentials →
  conflict/ban risk).
- Redeploys: the new deployment must pass `/readyz` before traffic shifts; the old
  instance keeps running until then. SIGTERM triggers a clean disconnect.
- Logs are structured JSON (pino) on stdout; Koyeb's log drain is the observability
  surface. Every AI call, connection change, and task run is logged with context.
- Free/eco instances are fine — the app holds no local state worth paying for.
