# Dataset pipeline — AVOID PRIME | FT

Reproducible processing of the community's WhatsApp export (group **AVOID PRIME | FT**
inside the WhatsApp community **AVOID CITY**) into the sanitized seed artifacts in
`data/seed/`. The original archive is the immutable source of truth; every artifact
here can be regenerated from it with these scripts alone.

## Reproduce

```bash
bash scripts/dataset/run_all.sh "/path/to/WhatsApp Chat with AVOID PRIME  FT.txt" data/seed
```

Stage order matters (03 and 05 read `participants.json`; 07 validates everything):

| Stage | Script | Output(s) in `data/seed/` |
| --- | --- | --- |
| 1 | `01_parse_export.py` | `normalized-messages.jsonl`, `dataset-meta.json`, `parse-summary.json` |
| 2 | `02_participants.py` | `participants.json` (+ **private** map in the workspace, see below) |
| 3 | `03_statistics.py` | `statistics.json`, `language-profile.json`, `comparison.json` |
| 4 | `04_summaries.py` | `conversation-summaries.json` |
| 5 | `05_lore.py` | `community-lore.json` (auto candidates + curated entries from `lore-curated.json`) |
| 6 | `06_semantic_index.py` | `semantic-index.jsonl`, `semantic-index.sqlite` (FTS5) |
| 7 | `07_quality_report.py` | `quality-report.json`, `quality-report.md` |

Methodology definitions are recorded inside `statistics.json` (`methodology` key):
tokenizer, term counting, burst window (same sender, ≤ 60 s, non-deleted), drift
(top-80 token Jaccard across corpus thirds), emoji ranges, timezone assumption
(timestamps are as exported — local device time, assumed WIB/UTC+7).

## Curation

`lore-curated.json` is the human-verified layer between the archive and
`community-lore.json`: each entry cites message ids that stage 5 verifies against
`normalized-messages.jsonl` (`citations_verified`). To amend lore, edit
`lore-curated.json` with real ids and re-run stages 5 and 7.

## Privacy model

- **`data/seed/` (derived)**: sender pseudonym keys (`p-…`), display-name aliases
  participants chose in the group, phone-number sender aliases fully masked
  (`+CC ••••••••XX`), and message text with any phone number replaced by
  `[no-diredam]`.
- **`data/source/` (originals)**: published by explicit owner authorization
  (2026-11-23, members' consent confirmed) — raw export, ZIP copy, VCF cards,
  and the raw→key alias map (`participants-map.json`). Stage 2's `--work` output
  mirrors `data/source/participants-map.json`.
- Stage 7 re-scans every derived artifact for phone patterns, the raw numbers, and
  credential patterns — the committed quality report must show 0 hits for
  `data/seed/`. Credential boundaries (API keys, PATs, session state) stay out of
  the repository entirely.

## Parser notes (extraction decisions)

- **System events** (created group, joins/settings changes, encryption notice) are
  kept as `kind: system` records with an `event_type`; they are excluded from
  language statistics.
- **Deleted messages** ("This message was deleted") are kept, typed `deleted`,
  excluded from language statistics, counted everywhere else.
- **Media** messages keep their placeholder, typed `media` with detected types.
- **Empty-body messages** (`sender: ` followed by nothing — view-once media or
  stickers that the text export cannot render) are typed `empty`. The earlier
  ad-hoc analysis had folded these into its media count.
- **Multiline** messages keep their line structure (`text_original`) alongside a
  whitespace-collapsed `text_normalized`.
- **Identical consecutive records** (same minute, sender, and content — image spam,
  repeated mention pings, rapid re-deletions) are flagged `duplicate: true` and
  kept, so all counts remain comparable with earlier passes.
- **Timestamps** are kept as exported; 13 out-of-order receipts (≤ 14 min skew) are
  genuine WhatsApp delivery-order artifacts and are retained (see quality report).
