#!/usr/bin/env python3
"""Stage 1 — parse the original WhatsApp export into normalized-messages.jsonl.

Reprocessing starts from the immutable source archive; nothing is imported from
the earlier ad-hoc analysis. Outputs:
  data/seed/normalized-messages.jsonl  (sanitized, one JSON object per message)
  data/seed/dataset-meta.json          (source hash, provenance, versions)
  data/seed/parse-summary.json         (extraction counts + diagnostics)
"""

import argparse
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ds_common as ds  # noqa: E402

MEDIA_NOISE_RE = re.compile(r"<Media omitted>|\(file attached\)|Contact card omitted")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=ds.ARCHIVE_DEFAULT)
    ap.add_argument("--out", default=ds.SEED_DEFAULT)
    args = ap.parse_args()

    src = args.source
    with open(src, "rb") as fh:
        blob = fh.read()
    sha256 = hashlib.sha256(blob).hexdigest()

    records, meta = ds.parse_export(src)
    os.makedirs(args.out, exist_ok=True)

    out_path = os.path.join(args.out, "normalized-messages.jsonl")
    counts = {"records": 0, "user": 0, "system": 0, "text": 0, "media": 0,
              "deleted": 0, "empty": 0, "multiline": 0, "duplicates": 0, "tokens_total": 0}
    by_date = {}

    with open(out_path, "w", encoding="utf-8") as fh:
        for rec in records:
            counts["records"] += 1
            text_original = "\n".join(rec.lines)
            text_norm = MEDIA_NOISE_RE.sub(" ", ds.normalize_text(rec.lines)).strip()
            tokens = ds.tokenize(text_norm) if not rec.is_system else []
            counts["tokens_total"] += len(tokens)
            kind_counts_key = {"text": "text", "media": "media", "deleted": "deleted", "empty": "empty"}.get(rec.kind)
            date = rec.ts.strftime("%Y-%m-%d")
            if rec.is_system:
                counts["system"] += 1
            else:
                counts["user"] += 1
                counts[kind_counts_key] += 1
                by_date[date] = by_date.get(date, 0) + 1
                if rec.duplicate:
                    counts["duplicates"] += 1
            if len(rec.lines) > 1:
                counts["multiline"] += 1

            alias = None
            named = False
            if rec.raw_sender:
                named = bool(re.search(r"[^\d\s+\-]", rec.raw_sender)) and not rec.raw_sender.startswith("+")
                alias = rec.raw_sender if named else ds.mask_phone_digits(rec.raw_sender)

            obj = {
                "id": f"m{rec.seq:06d}",
                "seq": rec.seq,
                "ts": rec.ts.strftime("%Y-%m-%dT%H:%M:%S") if rec.ts else None,
                "date": date,
                "weekday": rec.ts.strftime("%a") if rec.ts else None,
                "hour": rec.ts.hour if rec.ts else None,
                "kind": "system" if rec.is_system else "user",
                "type": "system_event" if rec.is_system else rec.kind,
                "event_type": rec.event_type,
                "media": rec.media,
                "sender_key": None if rec.is_system else ds.sender_key(rec.raw_sender),
                "sender_alias": alias,
                "sender_named": named if rec.raw_sender else None,
                "text_original": text_original,
                "text_normalized": text_norm if not rec.is_system else text_original,
                "tokens": len(tokens),
                "multiline": len(rec.lines) > 1,
                "duplicate": rec.duplicate,
                "line_start": rec.line_start,
                "line_end": rec.line_end,
                "parser_version": ds.PARSER_VERSION,
            }
            fh.write(json.dumps(obj, ensure_ascii=False) + "\n")

    summary = {
        "source_file": os.path.basename(src),
        "source_sha256": sha256,
        "source_bytes": len(blob),
        "assumed_timezone": "WIB (UTC+7) — timestamps exported as local device time; no offset in file",
        "parser_version": ds.PARSER_VERSION,
        "parse": counts,
        "total_lines": meta["total_lines"],
        "blank_lines": meta["blank_lines"],
        "diagnostics": meta["diagnostics"][:50],
        "diagnostics_count": len(meta["diagnostics"]),
        "days_active": len(by_date),
    }
    ds.dump_json(os.path.join(args.out, "parse-summary.json"), summary)
    ds.dump_json(os.path.join(args.out, "dataset-meta.json"), {
        "dataset": "AVOID PRIME | FT — normalized WhatsApp export",
        "community": "AVOID PRIME | FT (group) inside WhatsApp community AVOID CITY",
        "source_archive": os.path.basename(src),
        "source_sha256": sha256,
        "source_bytes": len(blob),
        "parser_version": ds.PARSER_VERSION,
        "assumed_timezone": summary["assumed_timezone"],
        "sanitization": "sender pseudonyms; phone numbers masked as [no-diredam]; display aliases kept; raw numbers only in private workspace",
        "pipeline": "scripts/dataset (see scripts/dataset/README.md)",
    })
    print(json.dumps(summary, ensure_ascii=False, indent=1)[:2400])


if __name__ == "__main__":
    main()
