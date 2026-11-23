# Architecture

Omak is a single Node.js service that connects one WhatsApp account, persists
everything in Turso, and exposes two HTTP health endpoints. There is deliberately no
queue, no second process, and no local disk state — Koyeb instances are ephemeral and
the WhatsApp session must never run twice.

## Component map

```
WhatsApp ⇄ WhatsAppService (Baileys 7 socket)
             │  messages.upsert
             ▼
        normalize → dedupe → DB persist → BurstCollector (per-chat window)
             │
             ▼
      SocialOrchestrator
        ├─ commands (!) ──► CommandRegistry ──► builtins (stickers, memory, stats)
        ├─ rage-bait guard ──► deflection
        ├─ sticker hook ──► matchStickerByText ──► sendSticker
        └─ participation engine ──► AI prompt (persona + memory + context)
                                      │
                                      ▼
                                AIRouter (provider fallback + usage tracking)
                                      │
                                      ▼
                             validateReply + truth boundary ──► sendText
```

Side loops:

- **Scheduler** (interval tasks): retention (daily), summarizer (hourly), conversation
  starter (15 min, heavily gated).
- **Memory**: heuristic extraction on every burst; FTS5 retrieval at prompt time;
  AI-assisted summary of long segments.
- **Usage**: every successful AI call writes one aggregated row per day+provider
  (`ai_usage`), which also enforces `OMAK_MAX_DAILY_AI_CALLS`.

## Key design decisions

1. **Everything persists in Turso.** Baileys auth keys are AES-256-GCM-encrypted rows;
   sticker webp bytes are blobs; messages/memories are rows. A fresh instance can boot
   and reconnect with zero local state (research findings §7.1: Koyeb local storage is
   ephemeral and instances are rescheduled at least weekly).
2. **Scale 1 only.** A second instance would run a second WhatsApp session with the
   same credentials. Deployment docs pin this; `/readyz` gates traffic during deploys.
3. **Burst-collect before reacting.** The corpus shows 62.7% of bursts are single
   messages and the top-10 participants produce 94.8% of traffic (research §2.2), so
   the bot reacts to the burst as one context after a 2.5 s window, with cooldowns and
   a low ambient reply rate. It must blend in, not flood.
4. **Truth boundary is mechanical, not aspirational.** Roasts come from observed facts
   (idle time, repetition, match outcomes) or stored memories; `hasUnverifiableClaim`
   drops AI replies that assert past speech not present in the visible context
   (`src/social/personality.ts`).
5. **AI is optional at runtime.** With the router disabled the bot still runs: local
   roasts, sticker reactions, commands, deflections. Any provider failure just means
   the bot stays quiet for that burst.
6. **Baileys v7 specifics are handled, not worked around**: LID-first identity with
   `remoteJidAlt`/`participantAlt` alternates, `lid-mapping`/`device-list`/`tctoken`
   auth categories persisted, BufferJSON serialization for every stored blob, no
   manual ACKs (WhatsApp bans accounts that send them).

## Module boundaries

| Module | Owns | Never does |
| --- | --- | --- |
| `whatsapp/` | socket, raw events, sending | decisions about what to say |
| `social/` | whether/what to say | protocol details |
| `ai/` | provider I/O, prompt assembly, validation | persistence of chat content |
| `memory/` | what to remember and retrieve | WhatsApp I/O |
| `db/` | all SQL, migrations, crypto | business rules |
| `commands/` | `!` commands | background decisions |
| `scheduler/` | time-based tasks | reply decisions for bursts |

## Failure modes and behavior

| Failure | Behavior |
| --- | --- |
| AI provider down | router falls through the chain; last failure → bot stays quiet, usage row not written |
| Turso quota exceeded (`BLOCKED`) | DB ops throw → logged; message persistence skips; bot keeps running in-memory |
| WhatsApp `loggedOut` | auth store wiped (encrypted rows deleted) → next start re-pairs cleanly |
| Instance rescheduled | fresh boot from DB: migrations idempotent, auth keys loaded, session reconnects |
| Duplicate delivery after reconnect | MessageDeduper drops already-seen ids |
