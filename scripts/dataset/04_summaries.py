#!/usr/bin/env python3
"""Stage 4 — conversation summaries (per-day and per-week aggregates).

data/seed/conversation-summaries.json
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
    ap.add_argument("--out", default=ds.SEED_DEFAULT)
    args = ap.parse_args()

    rows = []
    with open(os.path.join(args.out, "normalized-messages.jsonl"), encoding="utf-8") as fh:
        for line in fh:
            rows.append(json.loads(line))
    user = [r for r in rows if r["kind"] == "user"]

    days = collections.defaultdict(lambda: {"msgs": 0, "users": set(), "media": 0, "deleted": 0,
                                            "empty": 0, "toks": collections.Counter(),
                                            "hours": collections.Counter(), "events": collections.Counter()})
    prev_key, prev_ts, cur_burst = None, None, 0
    day_burst_max = collections.defaultdict(int)
    burst_starts = {}

    for r in rows:
        d = days[r["date"]]
        if r["kind"] == "system":
            d["events"][r["event_type"] or "other"] += 1
            continue
        d["msgs"] += 1
        d["users"].add(r["sender_key"])
        if r["type"] == "media":
            d["media"] += 1
        elif r["type"] == "deleted":
            d["deleted"] += 1
        elif r["type"] == "empty":
            d["empty"] += 1
        else:
            d["toks"].update(ds.tokenize(r["text_normalized"])[:40])
        d["hours"][r["hour"]] += 1
        same = prev_key == r["sender_key"] and prev_ts and r["ts"]
        gap = (ds_time(r["ts"]) - ds_time(prev_ts)).total_seconds() if (same and prev_ts and r["ts"]) else 1e9
        if same and gap <= 60 and r["type"] != "deleted":
            cur_burst += 1
        else:
            cur_burst = 1 if r["type"] != "deleted" else 0
            burst_starts[r["date"]] = burst_starts.get(r["date"], [])[-3:]
            burst_starts.setdefault(r["date"], []).append((cur_burst, r["id"]))
        if cur_burst > day_burst_max[r["date"]]:
            day_burst_max[r["date"]] = cur_burst
        prev_key, prev_ts = r["sender_key"], r["ts"]

    def week_of(date):
        import datetime as dt
        d0 = dt.date.fromisoformat(date)
        return (d0 - dt.timedelta(days=d0.weekday())).isoformat()

    weeks = collections.defaultdict(lambda: {"msgs": 0, "users": set(), "toks": collections.Counter()})
    day_rows = []
    for date in sorted(days):
        d = days[date]
        day_rows.append({
            "date": date,
            "msgs": d["msgs"],
            "users_active": len(d["users"]),
            "media": d["media"],
            "deleted": d["deleted"],
            "empty": d["empty"],
            "top_tokens": [t for t, _ in d["toks"].most_common(6)],
            "busiest_hour": max(d["hours"], key=d["hours"].get) if d["hours"] else None,
            "system_events": dict(d["events"]),
            "longest_burst_len": day_burst_max[date],
        })
        wk = weeks[week_of(date)]
        wk["msgs"] += d["msgs"]
        wk["users"] |= d["users"]
        wk["toks"].update(d["toks"])

    week_rows = [{
        "week_start": ws,
        "msgs": w["msgs"],
        "users_active": len(w["users"]),
        "top_tokens": [t for t, _ in w["toks"].most_common(8)],
    } for ws, w in sorted(weeks.items())]

    out = {
        "community": "AVOID PRIME | FT (AVOID CITY)",
        "source_sha256": json.load(open(os.path.join(args.out, "dataset-meta.json")))["source_sha256"],
        "days_count": len(day_rows),
        "days": day_rows,
        "weeks": week_rows,
    }
    ds.dump_json(os.path.join(args.out, "conversation-summaries.json"), out)
    print(f"summaries: {len(day_rows)} days, {len(week_rows)} weeks; "
          f"peak day {max(day_rows, key=lambda d: d['msgs'])['date']} "
          f"({max(d['msgs'] for d in day_rows)} msgs)")


def ds_time(ts):
    from datetime import datetime
    return datetime.fromisoformat(ts) if ts else None


if __name__ == "__main__":
    main()
