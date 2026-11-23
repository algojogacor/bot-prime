# Community dataset audit — AVOID PRIME | FT

Date: 2026-11-23 · Auditor: dataset pipeline (`scripts/dataset/`) · Status: **closed — all checks passed**

## 1. Scope and verdict

The original WhatsApp export of the community was reprocessed from scratch with a
reproducible pipeline, and every derived artifact was compared against the earlier
ad-hoc analysis. Verdicts:

1. **Identity:** the archive belongs to the group **AVOID PRIME | FT**, created
   2026-09-28 inside the WhatsApp community **AVOID CITY**. "GB Prime" is a
   colloquial reference to *Grup Besar Prime* within this same ecosystem — it is
   **not** this group's name and **not** evidence of an unrelated community.
2. **Extraction:** the earlier core extraction was correct (all headline counts
   reproduce exactly). Its media/text classification and three content-classification
   metrics (profanity, laughter family, English mixing) were definitional; all are
   now replaced by documented, reproducible definitions.
3. **Dataset:** 79,090 records processed, 0 lost lines, 0 unattributed senders,
   0 phone-number leaks; artifacts in `data/seed/` (sanitized).

## 2. Identity reconciliation (the GB Prime question)

Evidence from the archive itself:

| Evidence | Value | Provenance |
| --- | --- | --- |
| Export filename | `WhatsApp Chat with AVOID PRIME  FT.txt` | file in workspace |
| Group creation line | `~ Apip created group "AVOID PRIME \| FT"` (28/09/2026 17:39) | msg `m000002` |
| Community notice | `…added you to a group in the community: AVOID CITY` | msg `m000003` |
| Group renames in 57 days | **0** subject-change events | system-event scan |
| Self-references | `avoid` 386, `prime` 499, `avo\|` roster prefix 116, `fp` token 2,887 | term counts |
| "gb prime" mentions | 3 direct + 1 direct comparison (`prime/gb`) | `m014439`, `m064027`, `m076619`, `m045519` |

The three direct "gb prime" mentions read as references to *Grup Besar Prime* — a
related group in the same ecosystem: a tournament focus instruction ("@all yg gb
prime di turnamen itu untuk fokus di turnamen yak"), a quiet-day complaint ("Sepi
kali wok gb prime"), and an offhand remark ("ga buka gb prime jir"). The fourth
message compares the two ("tp emg dibandingin prime/gb lebih rame prime"). None of
these is a group-subject change or an ownership signal.

**Correction applied:** the earlier framing in `docs/research/research-findings.md`
§2.1 called GB Prime "a different group that this group talks about … This archive
is NOT GB Prime". The wording implied a community mismatch that does not exist.
It has been rewritten to the reconciliation above. The canonical community label
for every artifact is **AVOID PRIME | FT** (community context: AVOID CITY).

## 3. Source integrity

| Item | Value |
| --- | --- |
| Source file | `WhatsApp Chat with AVOID PRIME  FT.txt` (3,866,417 bytes, 83,305 lines) |
| SHA-256 | `262ae7acb1ccc09307bff54e7ae74e62b4b80272a231eaff3cae8fd521e483bd` |
| Second copy | identical member inside `WhatsApp_Chat_with_AVOID_PRIME___FT.zip` (same SHA-256 — byte-verified) |
| Companion files | 4 `.vcf` contact cards in the same directory (published under `data/source/`) |
| Raw archive in repo | published under `data/source/` (owner-authorized 2026-11-23; the owner confirms members granted permission); SHA-256 unchanged |

## 4. Reprocessing pipeline

| Stage | Script | Output |
| --- | --- | --- |
| 1 | `01_parse_export.py` | `normalized-messages.jsonl` (79,090 records) + meta + parse summary |
| 2 | `02_participants.py` | `participants.json` (25 participants; raw→key map published as `data/source/participants-map.json`) |
| 3 | `03_statistics.py` | `statistics.json`, `language-profile.json`, `comparison.json` |
| 4 | `04_summaries.py` | `conversation-summaries.json` (57 days, 9 weeks) |
| 5 | `05_lore.py` | `community-lore.json` (auto candidates + 10 curated, citations verified) |
| 6 | `06_semantic_index.py` | `semantic-index.jsonl` + `semantic-index.sqlite` (FTS5, 71,302 rows) |
| 7 | `07_quality_report.py` | `quality-report.json` / `.md` — **9/9 checks passed** |

Reproduce everything: `bash scripts/dataset/run_all.sh "<archive path>" data/seed`.

## 5. Extraction audit — findings and corrections

### 5.1 Completeness and ordering

- **Line accounting:** 82,506 non-blank source lines are all consumed by records
  (784 of the 799 blank lines fall inside multiline message spans, 15 outside);
  0 orphan lines, 0 double-covered lines, 0 parse diagnostics.
- **Chronology:** 13 out-of-order receipts (max skew 14 min). These are genuine
  WhatsApp artifacts, not parser errors: the export's first line is the encryption
  notice (17:41) while the group-creation line (17:39) precedes it, and offline
  delivery reorders receipts relative to send timestamps. **Retained as exported.**
- **Duplicates:** 1,416 identical-consecutive records (same minute/sender/content) —
  1,001 are repeated media placeholders (image/sticker spam), the rest are repeated
  mention pings (`@~YONKOU強` ×53, `@all` ×52), rapid re-deletions, and identical
  text repeats. They are flagged (`duplicate: true`) and **kept**, so every count
  remains comparable with earlier passes.
- **Multiline:** 445 messages span multiple lines and keep both the original
  line-structured text and the collapsed normalized text.

### 5.2 Message-type classification (correction)

The export contains message kinds the earlier pass folded together:

| Type | Count | Handling |
| --- | --- | --- |
| text (non-empty) | 71,302 | full language statistics |
| media | 7,024 (all image placeholders; 5 with caption) | excluded from language stats, counted |
| empty-body (`sender: ` with nothing after) | 249 | **new type `empty`** — view-once media/stickers the text export cannot render; earlier pass counted these as media (its media total 7,270 = 7,024 media + 249 empty + 2 boundary) |
| deleted | 324 | kept, excluded from language stats |
| system events | 191 | kept with `event_type` (102 group-settings, 39 other, 17 joins, 13 adds, 13 removals, 3 leaves, 5 identity/one-off) |

### 5.3 Old-vs-new metric comparison (20 match / 10 definitional diff)

Exact matches include: parsed/user/system/deleted counts, participants (25),
days active (57), msgs/day (1,384.2), the full 24-bucket hour histogram, weekday
and month distributions, quiet-hours share (5.5%), participation shares
(27.6 / 79.5 / 94.8) and contribution buckets, ≤3-token share (68.1 vs 68.2),
uppercase share (1.2%), question share (5.2%), emoji share (2.6%), drift Jaccard
(0.553 vs 0.569, within tolerance), "gb prime" mentions (3), and the top-token
ranking (top 8 identical; `gw` 4,777 = 4,777).

The 10 differences, each explained:

| Metric | Old | New | Explanation |
| --- | --- | --- | --- |
| `totals.text_messages` | 71,305 | 71,302 | Δ3 caption-boundary messages |
| media | 7,270 | 7,024 + 249 `empty` | old folded empty-body export lines into media (§5.2) |
| `bursts.count` | 47,436 | 47,571 | old script not persisted; new def = same-sender ≤60 s, non-deleted (Δ 0.3%, distribution within 0.2 pp per bucket) |
| `emoji.total` | 2,546 | 2,547 | emoji range boundary (±1) |
| `emoji.distinct` | 187 | 180 | old range included 7 extra symbols (variation selectors / misc symbols) |
| `profanity.total_tokens` | 5,737 | 1,579 | old list was broader and unrecorded; new = documented 29-term word-boundary list (substring variant 2,715) |
| `profanity.msgs_pct` | 7.9% | 2.1% | same definitional cause |
| `laughter.wkwk_family` | 1,570 | 1,598 | regex breadth (old excluded some `wkwkwk…` run variants) |
| `length.chars_p50` | 12 | 11 | even-count median convention |
| `length.pct_all_lowercase` | 34.8% | 36.0% | old computed over a slightly different message set (incl. empty bodies); new = non-empty text messages |

### 5.4 Corrections applied to the previous analysis

1. **Identity framing** — §2.1 of the research findings rewritten (GB Prime is a
   colloquial reference, not a foreign community; AVOID PRIME | FT is canonical).
2. **`fp` token count** — the old identity block said 2,680 while the research doc
   said 2,888; the reproducible token-based count is **2,887** (word-boundary, NFKC).
3. **Media/empty split** — 249 empty-body lines now a first-class `empty` type.
4. **Definitional metrics** — profanity, laughter family, English mixing
   (3.0% broad / 1.8% strict with documented lists), lowercase share and median
   length now have recorded definitions; the unrecorded old variants are superseded.

### 5.5 Timezone interpretation

The export carries no UTC offsets. Timestamps are treated as **local device time,
assumed WIB (UTC+7)**. Sanity check: the hour histogram peaks at 20:00 (14,758)
with the trough at 02:00 — a shape consistent with an Indonesian evening-active
community; a wrong timezone would shift the peak into working/sleep hours. The
assumption is recorded in `dataset-meta.json` and every statistic.

## 6. Sanitization policy

`data/seed/` (derived artifacts) keeps the deterministic pseudonym layout: sender
keys (`p-…`), display-name aliases, phone senders masked to `+CC ••••••••XX`, and
message text with phone numbers replaced by `[no-diredam]`. The unmasked originals
are published under `data/source/` by explicit owner authorization (2026-11-23) —
the owner confirms the members represented in the dataset have granted permission.
Stage 7 re-scans every **derived** artifact for phone patterns, the private numbers,
and credential patterns — 0 hits (verified, quality report); credential boundaries
(service keys, PATs, session state) remain out of the repository by design.

## 7. Provenance and information-loss review

Every artifact derives from the immutable source through the committed scripts:

`WhatsApp export → 01 → normalized-messages.jsonl → 02/03/04/05/06 → seed artifacts`
(curation layer: `scripts/dataset/lore-curated.json`, citations verified by stage 5).

Loss inventory (what conversion to JSON/JSONL/SQLite deliberately does not carry):

- raw sender identifiers (phone numbers) — excluded from `data/seed/` derived
  artifacts, published with the source materials under `data/source/`
  (`participants-map.json`) by owner authorization;
- media binary content — the export itself only contains placeholders; nothing further
  was lost by the pipeline;
- typing indicators, reactions and ephemeral state — absent from the source export
  format itself;
- **no vector index is built**: retrieval uses FTS5 lexical search. Embedding-based
  indexes are deferred until an embedding provider is chosen; the
  `semantic-index.jsonl` rows are the ingestion-ready input for that future step.

## 8. Acceptance criteria checklist

| Criterion | Status |
| --- | --- |
| Dataset correctly attributed to AVOID PRIME \| FT | ✅ (§2, provenance in `dataset-meta.json`) |
| No false community mismatch reported | ✅ (research findings §2.1 rewritten) |
| All extraction discrepancies investigated | ✅ (20 match / 10 explained diffs, §5.3) |
| Language statistics reproducible | ✅ (`bash scripts/dataset/run_all.sh`; methodology recorded in `statistics.json`) |
| Member aliases mapped consistently | ✅ (25 participants, 0 unattributed, 0 collisions, multi-alias lists) |
| Community lore grounded in actual conversations | ✅ (every claim cites msg ids; verified by stage 5) |
| Original source not silently rewritten | ✅ (raw archive untouched + hash-verified; normalized text preserves original alongside normalized) |

## 9. Limitations

- Timestamps are timezone-assumed (WIB), not proven — irrelevant for hour-of-day
  behavior analysis, relevant only if cross-timezone math is ever needed.
- The burst-window definition differs from the unrecorded earlier one by 0.3%.
- Profanity/English/laughter metrics are list- and regex-defined; re-deriving them
  with different lists will yield different numbers by design — the lists ship with
  the code.
- Media statistics count placeholders, not content (the export has no media).
