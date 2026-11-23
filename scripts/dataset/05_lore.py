#!/usr/bin/env python3
"""Stage 5 — inside-joke / lore candidate extraction, grounded in the archive.

Auto pass: recurring n-grams and signature-term contexts, each example carrying
message ids + surrounding context so every lore claim can be checked against the
source. Curated pass: scripts/dataset/lore-curated.json (human-verified entries,
each citing msg ids that exist in normalized-messages.jsonl) is merged in.

data/seed/community-lore.json
"""

import argparse
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ds_common as ds  # noqa: E402

STOP = set("""di ke ya aja aku aku gw lu ga gk nggak kaga gak yang mau the a an and no itu ini dan
tapi kalo kalau udah dah sama buat dari dengan ada anak banget bgt sih dong deh kok punya kali
emang apa kok bisa nanti sudah baru lagi juga gue gua lu kamu kita saya dia mereka kita apa itu is
in on at to of for with my your you me we us be have do this that what when how why not just so
was were get got go going one two all can will now ok ok ok b a i u e o""".split())

SPECIAL_TERMS = {
    "gb prime": "Grup Besar Prime — colloquial reference (same AVOID CITY ecosystem)",
    "mandul": "standard banter for an inactive team/player",
    "yonkou": "recurring unit/team label (yonkou強)",
    "ambaking": "recurring team/unit label",
    "cut turn": "tournament terminology",
    "uid": "roster template element (uid posisi nickname no wa)",
    "avo|": "roster prefix AVO|<nickname>",
    "lawan": "matchmaking talk (lawan siapa / lawan eclipse)",
    "gb prime jir": "colloquial + interjection",
}
SPECIAL_LIMIT = 8


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=ds.SEED_DEFAULT)
    args = ap.parse_args()

    rows = []
    with open(os.path.join(args.out, "normalized-messages.jsonl"), encoding="utf-8") as fh:
        for line in fh:
            rows.append(json.loads(line))
    idx = {r["id"]: i for i, r in enumerate(rows)}
    user_rows = [r for r in rows if r["kind"] == "user" and r["text_normalized"]]

    bigrams, trigrams = collections.Counter(), collections.Counter()
    gram_days = collections.defaultdict(set)
    gram_days_tri = collections.defaultdict(set)
    gram_examples = collections.defaultdict(list)
    gram_tri_examples = collections.defaultdict(list)
    special_hits = collections.defaultdict(list)

    for r in user_rows:
        toks = ds.tokenize(r["text_normalized"])
        text_low = r["text_normalized"].lower()
        for a, b in zip(toks, toks[1:]):
            if a in STOP or b in STOP or a.isdigit() or b.isdigit():
                continue
            g = f"{a} {b}"
            bigrams[g] += 1
            gram_days[g].add(r["date"])
            if len(gram_examples[g]) < 3:
                gram_examples[g].append(r)
        for a, b, c in zip(toks, toks[1:], toks[2:]):
            if a in STOP or b in STOP or c in STOP or a.isdigit() or b.isdigit() or c.isdigit():
                continue
            g = f"{a} {b} {c}"
            trigrams[g] += 1
            gram_days_tri[g].add(r["date"])
            if len(gram_tri_examples[g]) < 3:
                gram_tri_examples[g].append(r)
        for term in SPECIAL_TERMS:
            if term in text_low:
                special_hits[term].append(r)

    def example(r, ctx=2):
        i = idx[r["id"]]
        lo, hi = max(0, i - ctx), min(len(rows), i + ctx + 1)
        context = [{"id": c["id"], "kind": c["kind"], "alias": c.get("sender_alias"),
                    "text": (c["text_normalized"] or c["text_original"])[:160]} for c in rows[lo:hi]]
        return {"id": r["id"], "ts": r["ts"], "alias": r.get("sender_alias"),
                "text": r["text_normalized"][:200], "context": context}

    candidates = []
    for gram, cnt in bigrams.most_common(400):
        if cnt >= 8 and len(gram_days[gram]) >= 3:
            candidates.append({"gram": gram, "count": cnt, "distinct_days": len(gram_days[gram]),
                               "kind": "bigram", "examples": [example(r) for r in gram_examples[gram][:3]]})
    for gram, cnt in trigrams.most_common(200):
        if cnt >= 5 and len(gram_days_tri[gram]) >= 3:
            candidates.append({"gram": gram, "count": cnt, "distinct_days": len(gram_days_tri[gram]),
                               "kind": "trigram", "examples": [example(r) for r in gram_tri_examples[gram][:3]]})
    candidates.sort(key=lambda c: -c["count"])
    candidates = candidates[:60]

    specials = {}
    for term, desc in SPECIAL_TERMS.items():
        hits = special_hits.get(term, [])
        specials[term] = {"description": desc, "count": len(hits),
                          "first_seen": hits[0]["ts"] if hits else None,
                          "last_seen": hits[-1]["ts"] if hits else None,
                          "examples": [example(r) for r in hits[:SPECIAL_LIMIT]]}

    curated_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lore-curated.json")
    curated = []
    if os.path.exists(curated_path):
        cdata = json.load(open(curated_path, encoding="utf-8"))
        for entry in cdata.get("entries", []):
            cites_ok = all(c["id"] in idx for c in entry.get("citations", []))
            curated.append({**entry, "citations_verified": cites_ok})

    out = {
        "community": "AVOID PRIME | FT (AVOID CITY)",
        "source_sha256": json.load(open(os.path.join(args.out, "dataset-meta.json")))["source_sha256"],
        "provenance": "auto candidates from normalized-messages.jsonl; curated entries cite msg ids",
        "curated_citations_all_verified": all(c["citations_verified"] for c in curated) if curated else None,
        "curated": curated,
        "special_terms": specials,
        "auto_candidates": candidates,
    }
    ds.dump_json(os.path.join(args.out, "community-lore.json"), out)
    print(f"lore: {len(curated)} curated (citations_verified={out['curated_citations_all_verified']}), "
          f"{len(specials)} special terms, {len(candidates)} auto candidates")
    for c in candidates[:15]:
        print(f"  [{c['kind']}] {c['gram']!r} x{c['count']} over {c['distinct_days']}d")


if __name__ == "__main__":
    main()
