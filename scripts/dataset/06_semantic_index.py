#!/usr/bin/env python3
"""Stage 6 — semantic index over the sanitized corpus.

Outputs:
  data/seed/semantic-index.jsonl    portable {id, ts, sender_key, text} rows
  data/seed/semantic-index.sqlite   SQLite FTS5 index (same rows) for instant
                                    keyword search; can be re-loaded into Turso
                                    (libSQL supports FTS5) with the documented
                                    INSERT statement.
User text messages only (media/deleted/empty/system are excluded — they carry no
searchable language).
"""

import argparse
import json
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ds_common as ds  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=ds.SEED_DEFAULT)
    args = ap.parse_args()

    src = os.path.join(args.out, "normalized-messages.jsonl")
    jsonl_path = os.path.join(args.out, "semantic-index.jsonl")
    db_path = os.path.join(args.out, "semantic-index.sqlite")

    n = 0
    with open(src, encoding="utf-8") as fh, open(jsonl_path, "w", encoding="utf-8") as out:
        for line in fh:
            r = json.loads(line)
            if r["kind"] == "user" and r["type"] == "text" and r["text_normalized"]:
                row = {"id": r["id"], "ts": r["ts"], "sender_key": r["sender_key"],
                       "text": r["text_normalized"]}
                out.write(json.dumps(row, ensure_ascii=False) + "\n")
                n += 1

    if os.path.exists(db_path):
        os.remove(db_path)
    con = sqlite3.connect(db_path)
    con.execute("CREATE VIRTUAL TABLE msgs USING fts5(id UNINDEXED, ts UNINDEXED, sender_key UNINDEXED, text)")
    con.execute("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)")
    meta = json.load(open(os.path.join(args.out, "dataset-meta.json")))
    con.executemany("INSERT INTO meta VALUES(?, ?)",
                    [("source_sha256", meta["source_sha256"]), ("rows", str(n)),
                     ("parser_version", meta["parser_version"])])
    with open(jsonl_path, encoding="utf-8") as fh:
        con.executemany(
            "INSERT INTO msgs(id, ts, sender_key, text) VALUES(?, ?, ?, ?)",
            [(r["id"], r["ts"], r["sender_key"], r["text"]) for r in map(json.loads, fh)])
    con.commit()

    sample = con.execute(
        "SELECT id, ts FROM msgs WHERE msgs MATCH '\"gb prime\"' ORDER BY ts LIMIT 5").fetchall()
    con.close()
    print(f"semantic-index: {n} rows; sqlite={os.path.getsize(db_path)//1024} KiB; "
          f"fts5 smoke query 'gb prime' -> {[s[0] for s in sample]}")


if __name__ == "__main__":
    main()
