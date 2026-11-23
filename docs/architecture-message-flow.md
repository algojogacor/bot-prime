# Architecture — Message Flow

This is the exact path of one burst through the system, with the guardrails in order.

## 1. Intake (`src/whatsapp/service.ts`)

1. Baileys emits `messages.upsert`.
2. `normalizeMessage` unwraps ephemeral/view-once wrappers, extracts text + type, and
   resolves the sender using v7 LID semantics: group senders come from
   `key.participant` (with `participantAlt` carrying the alternate PN↔LID form).
3. `MessageDeduper` drops ids already seen (redeliveries after reconnects).
4. The raw message is kept in a small per-chat ring (`recentRaw`) for admin commands.
5. The normalized message is persisted (`messages` table) and any PN↔LID pair observed
   is written to `lid_map` immediately — Baileys cannot reverse-resolve LIDs later.
6. The message enters the per-chat `BurstCollector` (2.5 s window).

## 2. Burst handling (`src/social/orchestrator.ts`)

When the window closes, `handleBurst(chatJid, burst)` runs the guardrail ladder:

| # | Gate | Effect if hit |
| --- | --- | --- |
| 1 | bot-only messages | return |
| 2 | `!command` present | run command, return (bypasses every social gate) |
| 3 | rage-bait request | count per user; after 3 asks → canned deflection, return |
| 4 | sticker hook (exact token match) | send sticker, return |
| 5 | daily AI quota exceeded | return |
| 6 | hourly limit / reply gap | return |
| 7 | mention token present | proceed to reply |
| 8 | ambient rate (default 4%) | usually return |
| 9 | AI path | prompt → router → validate → truth check → send |

Heuristic memory extraction (birthdays, UIDs, event times, "jangan X" preferences)
runs at step 2 regardless of the decision — memory writes never depend on the bot
speaking.

## 3. Reply generation

The prompt (`src/ai/prompt-builder.ts`) is assembled from:

- the persona system prompt (register rules from the language profile, §personality),
- up to 20 recent short-term context lines,
- the incoming burst,
- the FTS5 memory block matching the incoming text (or the chat's top memories),
- the roast guidelines (grounded-only rule).

The `AIRouter` tries providers in order (`AI_PROVIDER`, then `AI_FALLBACK_ORDER`);
every success writes the aggregated usage row. The reply is then:

1. length-capped and fence-stripped (`validateReply`),
2. truth-checked (`hasUnverifiableClaim`) — fabricated past-speech claims are replaced
   with a safe line,
3. sent with a human-like typing pause (`sendText`).

## 4. Proactive paths (scheduler)

- **Summarizer** (hourly): when a chat accumulates ≥30 new short-term messages since
  the last pass, one summary memory (`kind='summary'`) is stored.
- **Starter** (15 min): only 18:00–22:00 WIB, only after ≥45 min of silence, max 2 per
  chat per day (corpus: 23:00–07:00 carries 5.5% of traffic — the bot must not ping
  dead hours).
- **Retention** (daily): messages older than 60 days deleted; low-importance memories
  older than 30 days deleted; importance ≥ 3 survives.

## 5. What the bot never does

- never replies to itself, never ACKs deliveries (Baileys v7 removed them for a reason:
  accounts get banned for sending them),
- never starts a DM, never sends outside a chat it observed,
- never claims to be human, never fabricates facts about people,
- never escalates when provoked repeatedly (rage-bait limiter).
