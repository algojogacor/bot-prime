# Community lore — AVOID PRIME | FT

The group's inside culture, grounded in the chat archive itself. Every claim cites
message ids from `data/seed/normalized-messages.jsonl`; quotes are verbatim
(sanitized). The structured version (with context snippets) is
`data/seed/community-lore.json`; the curation layer lives in
`scripts/dataset/lore-curated.json` and is citation-verified by the pipeline.
Senders appear under their in-group display names; unsaved numbers are masked.

## 1. Origin and identity

AVOID PRIME | FT was created on **2026-09-28 at 17:39** by ~Apip inside the WhatsApp
community **AVOID CITY** (`m000002`). Within two minutes the first members were in,
admin-approval locking was switched on the same evening (`m000010`), and by 17:51 the
first roster list was already being drafted — "1. AVO|GACOR CB FORD" (`m000020`).

**GB Prime is Grup Besar Prime** — a colloquial name for a related group in the same
ecosystem, never this group's name and never an outside community. In two months it
comes up three times by name plus one direct comparison: a tournament focus call
("@all yg gb prime di turnamen itu untuk fokus di turnamen yak", `m014439`), a
quiet-day complaint ("Sepi kali wok gb prime", `m064027`), an offhand "ga buka gb
prime jir" (`m076619`), and the comparison "tp emg dibandingin prime/gb lebih rame
prime" (`m045519`) — this group is the livelier one, and it knows it.

## 2. Roster culture: AVO| and the signup template

Squad posts follow a fixed template — `uid posisi nickname no wa` — and members style
themselves `AVO|<nickname>` with a position (ST/CB/WF/GK). The convention started in
the very first roster message (`m000020`) and still appears in tournament signups,
e.g. "AVO|BENNED CB UID : 10021561" (`m031416`) and the full championship form posted
for ARELYNS FLASH PEAK CHAMPIONSHIP — SEASON 3 (`m001262`, `m001264`).

## 3. The matchmaking ritual

Spar coordination has a call-and-response shape the bot must recognize: someone asks
**"lawan siapa"** (×84 across 38 days, e.g. `m000936`), someone answers with a rival
name and **"gas"** — "Gas lawan eclipse" (`m000371`). Rivals recur: Eclipse, Impact,
AGI, Centra, Fision ("mending kita cba lawan impact", `m009949`). Fixtures get real
organization: "Jadwal AVOID LEAGUE Hari Match 1 Match 2 Match 3" (`m005382`).

## 4. eFootball meta-talk

Tactical coaching is constant: "Pernah pakai cut turn gk sebelum shoot?" (`m004202`),
"better buang long ball aja ya" when the connection lags (`m003612`), "fake shoot"
tricks, and goalkeeper blame after every conceded goal ("Kiper nya padahal udah
berapa Kali penyelamatan", `m003698`). Positions are written as st/cb/wf/gk in every
lineup ("Avoid Prime VS ST Alfikra WF AMBAKING CB CB Benned GK", `m000501`).

## 5. Member tags with honorifics

Core members are tagged with Japanese-styled honorifics inside mentions: @~YONKOU強
(強 = strong, 910 mentions), @~Alfikra神 (神 = god), and AMBAKING (490) doubles as a
roster position filler (`m002628`, `m001687`, `m000501`). The bot should recognize
these tags as names, never translate or "correct" them.

## 6. mandul — the signature roast

**mandul** ("barren") is the standard roast for an inactive team or player — 477 hits
across 51 days, nearly always paired with *jir* and a 🗿 or 🤣: "Ko mandul jir 🗿"
(`m003303`), "Fikra mandul jir 🤣" (`m005701`), self-deprecating variant "Mandul aku
Wak 🤧" (`m005215`). This is the template for the roast module: short, grounded,
laughing-with-you.

## 7. Coordination catch-phrases

The group runs on short lowercase formulas, one per line: "p info main lah abis ini"
(`m000030`), "info rank lah @all" (`m002518`), "Yg main?" (`m000666`), "ayo mabar rank
full tim klo bisa" (`m000450`), "jam brp selesai oi" (`m000392`). The bot's proactive
starters should reuse these shapes — questions and rally calls, never announcements.

## 8. TikTok clips as social currency

`vt.tiktok.com` links appear on 32 different days (69 occurrences), usually game
highlights — showing off and roasting each other's gameplay (`m006475`).

## 9. Omak joins the group

On the archive's final day (2026-11-23 14:23) the bot was added (system event
`m079084`), arya greeted it with "selamat datang member baru" (`m079086`), Biapis FP
welcomed it — "Wih ada bot disinih" (`m079087`) — and it was immediately tested with
"!myid" (`m079090`) to "wkowkowk" (`m079089`). The group expects a member, not a
service; that is exactly the persona contract in `personality.md`.
