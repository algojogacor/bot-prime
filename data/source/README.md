# data/source — original materials (published by owner authorization)

The project owner has explicitly authorized publishing the complete AVOID PRIME | FT
dataset in this public repository, including the original source files, and confirms
that the members represented in the dataset have granted permission. Publication
was approved 2026-11-23; service credentials remain out of scope by design.

| File | What it is |
| --- | --- |
| `WhatsApp Chat with AVOID PRIME  FT.txt` | **Immutable source of truth** — the original WhatsApp export of the group AVOID PRIME | FT (community AVOID CITY). SHA-256 `262ae7acb1ccc09307bff54e7ae74e62b4b80272a231eaff3cae8fd521e483bd`. 83,305 lines, 2026-09-28 → 2026-11-23. |
| `WhatsApp_Chat_with_AVOID_PRIME___FT.zip` | Original ZIP containing the same export (byte-identical member, same SHA-256) plus the VCF files below. |
| `*.vcf` (4 files) | Companion contact cards that arrived alongside the export. |
| `participants-map.json` | Participant identity/alias mapping: raw exported sender → pseudonym key → display alias (used by the pipeline and retrieval). |
| `legacy-analysis/` | Historical analysis artifacts kept for provenance: `stats.json` (first-pass aggregate statistics — superseded by `data/seed/statistics.json`, 20/30 metrics reproduce exactly), `candidates_scrubbed.txt` (first-pass scrubbed corpus), `participants_private.txt` (first-pass private mapping). |

Everything in `data/seed/` is derived from the TXT above by
`scripts/dataset/` and can be regenerated end to end with:

```bash
bash scripts/dataset/run_all.sh "data/source/WhatsApp Chat with AVOID PRIME  FT.txt" data/seed
```

The derived artifacts in `data/seed/` keep sender pseudonyms and mask phone
numbers inside message text; the unmasked originals live here, as approved.
