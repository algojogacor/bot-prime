# Data quality report — AVOID PRIME | FT dataset

Source: `WhatsApp Chat with AVOID PRIME  FT.txt` — sha256 `262ae7acb1ccc09307bff54e7ae74e62…`  

| Check | Result | Detail |
| --- | --- | --- |
| source_sha256_matches_recorded | PASS | 262ae7acb1ccc093… |
| line_accounting_complete | PASS | 82506 non-blank lines consumed inside message spans (+784 blank lines inside multiline message spans) + 15 blank lines outside messages + 0 diagnostics = 83305 / 83305 source lines; 0 orphan lines, 0 double-covered lines |
| chronological_order_with_expected_receipt_skew | PASS | 13 out-of-order receipts (max skew 14.0 min) — genuine WhatsApp DB-order artifacts: offline delivery and system-line ordering (export line 1 is the encryption notice at 17:41, group creation at 17:39 precedes it); retained as exported |
| duplicates_flagged_not_dropped | PASS | 1416 identical-consecutive records kept and flagged: {'media': 993, 'text': 353, 'deleted': 62, 'empty': 8} |
| sender_attribution_complete | PASS | 25 participants, 0 unattributed, 0 alias collisions |
| no_phone_numbers_in_artifacts | PASS | phone-pattern hits: 0, private-number hits: 0 |
| no_credentials_in_artifacts | PASS | secret-pattern hits: 0 |
| timezone_sanity_wib | PASS | peak hour 20:00, trough 2:00 — consistent with WIB (UTC+7) assumption |
| lore_citations_verified | PASS | 10 curated entries, all citations resolve to real msg ids |

## Old-vs-new comparison

20 metrics match the earlier ad-hoc analysis exactly; 10 differ by documented definitions (see community-dataset-audit.md §5):

- `bursts.count`: old=47436 new=47571 — 
- `emoji.total`: old=2546 new=2547 — 
- `emoji.distinct`: old=187 new=180 — 
- `profanity.total_tokens`: old=5737 new=1579 — 
- `profanity.msgs_pct`: old=7.9 new=2.1 — 
- `laughter.wkwk_family`: old=1570 new=1598 — 
- `length.chars_p50`: old=12.0 new=11 — 
- `length.pct_all_lowercase`: old=34.8 new=36.0 — 
- `totals.text_messages`: old=71305 new=71302 — old text = new text +3 caption-boundary msgs; old media 7270 = new 7024 + 249 empty-body msgs (now type=empty)
- `media.msgs`: old=7270 new=7273 — old classified empty-body export lines as media; new tracks them as type=empty

## Verification samples (10 random messages)

| id | ts | alias | normalized |
| --- | --- | --- | --- |
| m046070 | 2026-11-01T16:08:00 | Eren Fariz FP | Biapis jan maju ss |
| m021084 | 2026-10-18T21:29:00 | +CC ••••••••51 | lawan SA yang mna? |
| m056514 | 2026-11-05T17:42:00 | arya | klo prime gak |
| m006735 | 2026-10-08T20:48:00 | Benned FP | @all klo bisa jgn ada yg in game dlu yak |
| m010187 | 2026-10-11T20:55:00 | Benned FP | Seperti biasa yaa fokuss |
| m077461 | 2026-11-22T20:40:00 | +CC ••••••••70 | Gimana ini wok |
| m013229 | 2026-10-14T19:52:00 | Benned FP | Oke |
| m052203 | 2026-11-03T20:07:00 | Iky FP | @Benned FP udh enak kan gw nyari ruang tapi ga konek |
| m008124 | 2026-10-09T21:48:00 | Benned FP | Dirimu klo shoot selalu ke kanan gawang jir |
| m073288 | 2026-11-20T12:28:00 | arya | ngapain kok ak wok |

**Overall: ALL CHECKS PASSED**
