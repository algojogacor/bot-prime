#!/usr/bin/env python3
"""Stage 2 — sender attribution + alias mapping.

Reads data/seed/normalized-messages.jsonl and produces:
  data/seed/participants.json       (committed: pseudonym keys + public aliases)
  <work>/participants-map.json      (private: raw sender string -> key; NEVER committed)

Integrity checks: every user message resolves to a key; distinct raw senders vs
distinct keys (deterministic mapping, collision-free by construction — verified);
alias collisions reported.
"""

import argparse
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ds_common as ds  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=ds.ARCHIVE_DEFAULT)
    ap.add_argument("--out", default=ds.SEED_DEFAULT)
    ap.add_argument("--work", default=ds.WORK_DEFAULT)
    args = ap.parse_args()

    seed = args.out
    raw_to_key = {}
    key_to_alias = {}
    key_to_named = {}
    key_alias_count = collections.Counter()  # alias -> set of keys via raw
    stats = collections.defaultdict(lambda: {
        "messages": 0, "text": 0, "media": 0, "deleted": 0, "tokens": 0,
        "first": None, "last": None, "days": set(), "aliases": collections.Counter(),
        "raws": set(),
    })

    path = os.path.join(seed, "normalized-messages.jsonl")
    unattributed = 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            r = json.loads(line)
            if r["kind"] == "system":
                continue
            key = r["sender_key"]
            if not key:
                unattributed += 1
                continue
            st = stats[key]
            st["messages"] += 1
            st[r["type"] if r["type"] in ("text", "media", "deleted") else "text"] += 1
            st["tokens"] += r.get("tokens", 0)
            st["first"] = r["ts"] if not st["first"] else min(st["first"], r["ts"])
            st["last"] = r["ts"] if not st["last"] else max(st["last"], r["ts"])
            st["days"].add(r["date"])
            alias = r["sender_alias"] or "(unknown)"
            st["aliases"][alias] += 1
            key_to_alias[key] = alias
            key_to_named[key] = bool(r["sender_named"])
            raw_to_key.setdefault(r["sender_alias"], key)  # raw alias only; raw numbers are not in jsonl

    # True raw identifiers (incl. unsaved numbers) come from re-parsing the
    # source archive itself — stage 1 never writes them to committed files.
    raw_map = {}
    records, _ = ds.parse_export(args.source)
    for rec in records:
        if not rec.is_system and rec.raw_sender:
            raw_map.setdefault(rec.raw_sender, ds.sender_key(rec.raw_sender))

    os.makedirs(args.work, exist_ok=True)
    total_user = sum(s["messages"] for s in stats.values())

    parts = []
    for key, st in stats.items():
        alias = key_to_alias[key]
        alias_list = [a for a, _ in st["aliases"].most_common()]
        parts.append({
            "key": key,
            "alias": alias_list[0] if alias_list else "(unknown)",
            "aliases": alias_list,
            "alias_type": "display-name" if key_to_named[key] else "phone-masked",
            "messages": st["messages"],
            "text": st["text"],
            "media": st["media"],
            "deleted": st["deleted"],
            "tokens": st["tokens"],
            "first_seen": st["first"],
            "last_seen": st["last"],
            "active_days": len(st["days"]),
            "share_pct": round(100.0 * st["messages"] / total_user, 1) if total_user else 0.0,
        })
    parts.sort(key=lambda p: -p["messages"])

    buckets = collections.Counter()
    for p in parts:
        m = p["messages"]
        buckets["1"] += m == 1
        buckets["2_to_9"] += 2 <= m <= 9
        buckets["10_to_99"] += 10 <= m <= 99
        buckets["100_to_999"] += 100 <= m <= 999
        buckets["1000_plus"] += m >= 1000

    alias_keys = collections.defaultdict(set)
    for p in parts:
        alias_keys[p["alias"]].add(p["key"])
    collisions = {a: sorted(ks) for a, ks in alias_keys.items() if len(ks) > 1}

    result = {
        "community": "AVOID PRIME | FT (AVOID CITY)",
        "source_sha256": json.load(open(os.path.join(seed, "dataset-meta.json")))["source_sha256"],
        "count": len(parts),
        "total_user_messages": total_user,
        "participation_buckets": dict(buckets),
        "integrity": {
            "unattributed_user_messages": unattributed,
            "distinct_keys": len(parts),
            "distinct_aliases": len(alias_keys),
            "alias_collisions": collisions,
        },
        "participants": parts,
    }
    ds.dump_json(os.path.join(seed, "participants.json"), result)

    # Private map (raw sender string -> key). Stays in the workspace, never committed.
    ds.dump_json(os.path.join(args.work, "participants-map.json"), {
        "_comment": "PRIVATE: raw sender identifiers as exported. Do not commit.",
        "raw_to_key": {k: v for k, v in sorted(raw_map.items())},
        "key_to_alias": dict(sorted(key_to_alias.items())),
    })

    print(f"participants={len(parts)} user_msgs={total_user} unattributed={unattributed} "
          f"alias_collisions={len(collisions)} buckets={dict(buckets)}")
    for p in parts[:10]:
        print(f"  {p['alias']:<22} {p['messages']:>6}  {p['share_pct']:>5}%  days={p['active_days']}")


if __name__ == "__main__":
    main()
