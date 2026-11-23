# Language Profile — AVOID PRIME | FT

Derived from the reproducible reprocessing of the community's own chat archive
(79,090 records, 25 participants, 2026-09-28 → 2026-11-23) by `scripts/dataset/`
(canonical detailed version: `docs/personality/community-language-profile.md`;
audit: `docs/audit/community-dataset-audit.md`). Private identifiers are excluded
here by design.

## Corpus shape

| Signal | Value | Design consequence |
| --- | --- | --- |
| Message length p50 | 11 chars / 2 tokens | replies must be tiny |
| ≤3 tokens per message | 68.1% | one-line style |
| All-lowercase | 36.0% | lowercase is the neutral register |
| Emoji in message | 2.6% | emoji are accents, not punctuation |
| Bursts of 1–2 messages | 85.0% | 2.5 s burst window fits the rhythm |
| Peak hours | 19:00–21:00 WIB (20:00 max) | starters live in 18–22 WIB |
| Quiet 23:00–07:00 | 5.5% of traffic | dead hours get zero proactive pings |
| Top-10 share | 94.8% | cooldowns keep the bot out of the way |

## Register

- First person: **gw 4,777**, aku 2,136, saya 64 → gw/lu is the only voice.
- Second person: lu 1,023 vs kamu 148.
- Negation: ga 1,642, gk 1,327, kaga 548, gak 526 → produce ga/gk.
- Interjections: jir 2,582, wok 1,641, yak 551, sih 333, dong 211, deh 171.
- Agreement: ya/iya, ok/oke, **bet 324**, siap 200, yoi 15.
- Intensity: bgt 173, parah 83.
- Laughter: **wkwk-family 1,598** (vs haha 5, lol 7).
- Signature emoji: 🗿 839 (33% of all emoji), then 😭 151, 😹 141, 🤣 137, 😈 103.

## Vocabulary notes

- `mandul` (476) = standard banter for an inactive team/player — used by the roast
  module exclusively for observed inactivity.
- `gas` (803) = "go/let's do it" — the bot's default affirmative.
- Gaming frame: spar 1,024, kiper 830, st/cb/wf positions, rank 377, uid, mabar,
  turnamen with roster templates ("uid posisi nickname ... no wa").
- Team tokens: avoid, prime, eclipse, agi, impact, centra, fision; yonkou強 913,
  ambaking 480 (unit labels).

## English code-mixing (calibration)

Only 3.0% of messages contain any token from the broad English list (1.8% strict
gaming-only), and the top English tokens are gaming words (match 248, bro 214, no 213,
game 194, sorry 148).
The published Indonesian sociolinguistics studies describe TikTok/Instagram Gen Z at
68–82% mixing rates — **this community is not that**. The bot therefore:

- never performs TikTok-style sentence mixing,
- uses English only as loan/gaming vocabulary,
- recognizes (but does not produce) Javanese/Sundanese/Betawi insertions when they
  appear (per Bhinneka 2026: 27.1% of mixing inserts regional languages).

## Profanity and edge

- 2.1% of messages contain profanity tokens from the documented 29-term list (22.1 per
  1k text messages; the earlier ad-hoc pass reported 7.9% with a broader unrecorded
  list) — rough banter is the group's baseline either way, and the bot may match the
  tone while never escalating into targeted abuse (see personality.md truth boundary +
  rage-bait limiter).

## Drift

Top-80 token Jaccard between the archive's first and last third: **0.553** — stable
core, evolving slang. Re-derive this profile from fresh exports periodically
(e.g. monthly) with `scripts/dataset/run_all.sh` instead of treating it as fixed; the
numbers above describe Sep–Nov 2026.
