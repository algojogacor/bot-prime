#!/usr/bin/env python3
"""Stage 3 — recompute all language/behavior statistics from the parsed corpus.

Outputs:
  data/seed/statistics.json         (canonical, recomputed — mirrors the metric
                                    families of the earlier ad-hoc analysis so
                                    every number can be compared)
  data/seed/language-profile.json   (machine-readable seed for the bot)
  data/seed/comparison.json         (old vs new, metric by metric)

Definitions are explicit and deterministic: tokenizer = lowercase word tokens on
text_normalized; term counts = word-boundary regex; bursts = same-sender
consecutive user messages with gap <= 60 s; drift = top-80 token Jaccard between
first and last third of the corpus.
"""

import argparse
import collections
import json
import os
import re
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ds_common as ds  # noqa: E402

TERMS = {
    "gw": r"\bgw\b", "aku": r"\baku\b", "ak": r"\bak\b", "gua": r"\bgua\b", "gue": r"\bgue\b",
    "saya": r"\bsaya\b", "lu": r"\blu\b", "kamu": r"\bkamu\b", "km": r"\bkm\b", "elu": r"\belu\b",
    "kita": r"\bkita\b",
    "cok": r"\bcok+c*\b", "bang": r"\bbang\b", "bro": r"\bbro\b", "bg": r"\bbg\b",
    "mas": r"\bmas\b", "temen": r"\btemen\b", "guys": r"\bguys\b", "cuy": r"\bcuy+c*\b",
    "coy": r"\bcoy+c*\b", "bestie": r"\bbestie\b",
    "ga": r"\bga\b", "gk": r"\bgk\b", "kaga": r"\bkaga\b", "gak": r"\bgak\b",
    "engga": r"\bengga\b", "nggak": r"\bnggak\b",
    "jir": r"\bjir+c*\b", "kan": r"\bkan\b", "si": r"\bsi\b", "cik": r"\bcik\b",
    "sih": r"\bsih\b", "mah": r"\bmah\b", "dong": r"\bdong\b", "loh": r"\bloh\b",
    "deh": r"\bdeh\b", "yak": r"\byak+c*\b", "wok": r"\bwok+k*\b", "weh": r"\bweh\b", "euy": r"\beuy\b",
    "ya": r"\bya\b", "iya": r"\biya\b", "ok": r"\bok+\b", "oke": r"\boke\b", "y": r"\by\b",
    "bet": r"\bbet+\b", "nah": r"\bnah\b", "siap": r"\bsiap\b", "iyh": r"\biyh\b",
    "bener": r"\bbener\b", "yoi": r"\byoi\b", "mantap": r"\bmantap\b", "sip": r"\bsip\b",
    "bgt": r"\bbgt\b", "parah": r"\bparah\b", "banget": r"\bbanget\b", "amat": r"\bamat\b",
    "mandul": r"\bmandul\b", "gas": r"\bgas+\b", "spar": r"\bspar\b", "kiper": r"\bkiper\b",
    "rank": r"\brank\b", "uid": r"\buid\b", "mabar": r"\bmabar\b", "turnamen": r"\bturnamen\b",
    "lawan": r"\blawan\b", "login": r"\blogin\b", "tim": r"\btim\b",
    "avoid": r"\bavoid\b", "prime": r"\bprime\b", "eclipse": r"\beclipse\b", "agi": r"\bagi\b",
    "impact": r"\bimpact\b", "centra": r"\bcentra\b", "fision": r"\bfision\b",
    "yonkou強": r"yonkou", "ambaking": r"\bambaking\b", "fp": r"\bfp\b", "avo": r"\bavo\b",
}
WKWK_RE = re.compile(r"\bw+k+w+k*(?:w+k*)*\b")
AWOK_RE = re.compile(r"\bawo+k+awo+k+\b|\bawoko+w+\b")
HAHA_RE = re.compile(r"\bha+h+a+h+a*\b|\bhahah+\b")
LOL_RE = re.compile(r"\blol\b|\blmao+\b", re.I)

PROFANITY = ["anjing", "ajg", "anjir", "bangsat", "bgst", "bajingan", "jancuk", "jancok",
             "cuk", "cok", "kontol", "memek", "pepek", "ngentot", "entot", "tai", "asu",
             "tolol", "goblok", "gblg", "bodo", "bodoh", "idiot", "sial", "kampret",
             "keparat", "sarap", "sange", "bego"]
PROF_RE = [re.compile(rf"\b{re.escape(t)}\b", re.I) for t in PROFANITY]
PROF_RE_SUB = [re.compile(re.escape(t), re.I) for t in PROFANITY]

EN_BROAD = ["match", "bro", "no", "game", "sorry", "team", "win", "guys", "wait", "the",
            "nice", "play", "gg", "good", "luck", "ready", "yes", "best", "ok", "well"]
EN_STRICT = ["match", "game", "sorry", "team", "win", "wait", "the", "nice", "play",
             "gg", "ready", "guys"]

EMOJI_RE = re.compile(r"[\U0001F000-\U0001FAFF\u2190-\u21FF\u2600-\u27BF\u2B00-\u2BFF\u2934\u2935\u3030\u303D\u3297\u3299]")


def median(xs):
    xs = sorted(xs)
    if not xs:
        return 0
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


def pct(a, b):
    return round(100.0 * a / b, 1) if b else 0.0


def _pctl(xs, q):
    """Nearest-rank percentile (index-based, matching the earlier analysis)."""
    if not xs:
        return 0
    xs = sorted(xs)
    idx = min(len(xs) - 1, max(0, int(len(xs) * q / 100.0)))
    return xs[idx]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=ds.SEED_DEFAULT)
    ap.add_argument("--old", default="/home/z/my-project/.work/archive-analysis/stats.json")
    args = ap.parse_args()

    rows = []
    with open(os.path.join(args.out, "normalized-messages.jsonl"), encoding="utf-8") as fh:
        for line in fh:
            rows.append(json.loads(line))
    user = [r for r in rows if r["kind"] == "user"]
    system = [r for r in rows if r["kind"] == "system"]
    texts = [r for r in user if r["type"] == "text" and r["text_normalized"]]

    counts = {t: 0 for t in TERMS}
    phrase_counts = {"gb prime": 0, "cut turn": 0, "lawan eclipse": 0, "lawan siapa": 0,
                     "no wa": 0, "uid posisi": 0}
    prof_tokens = 0
    prof_msgs = 0
    prof_tokens_sub = 0
    en_any_msgs = 0
    en_strict_msgs = 0
    tok_counter = collections.Counter()
    bigrams = collections.Counter()
    trigrams = collections.Counter()
    emoji_counter = collections.Counter()
    emoji_msgs = 0
    wk_count = awok_count = haha_count = lol_count = 0
    mention_msgs = link_msgs = 0
    lengths = []
    token_lens = []
    lower_msgs = upper_msgs = quest_msgs = 0
    media_types = collections.Counter()
    media_captions = 0
    hourly = collections.Counter()
    weekly = collections.Counter()
    monthly = collections.Counter()
    days = set()

    thirds_tokens = [collections.Counter(), collections.Counter(), collections.Counter()]

    for i, r in enumerate(user):
        text = r["text_normalized"]
        toks = ds.tokenize(text)
        if r["date"]:
            days.add(r["date"])
            weekly[r["weekday"]] += 1
            monthly[r["date"][:7]] += 1
            hourly[f"{r['hour']:02d}"] += 1
        if r["type"] == "media":
            for mt in r["media"]:
                media_types[mt] += 1
            if MEDIA_PLACEHOLDER_CAPTION_RE.search(text):
                media_captions += 1
        if not toks and r["type"] != "text":
            continue
        third = min(2, i * 3 // max(1, len(user)))
        for t in toks:
            tok_counter[t] += 1
            thirds_tokens[third][t] += 1
        for t, rex in TERMS.items():
            if re.search(rex, text, re.I):
                counts[t] += 1
        low = text.lower()
        for ph in phrase_counts:
            if ph in low:
                phrase_counts[ph] += 1
        if WKWK_RE.search(text):
            wk_count += 1
        if AWOK_RE.search(text):
            awok_count += 1
        if HAHA_RE.search(text):
            haha_count += 1
        if LOL_RE.search(text):
            lol_count += 1
        if r["type"] == "text":
            for a, b in zip(toks, toks[1:]):
                bigrams[f"{a} {b}"] += 1
            for a, b, c in zip(toks, toks[1:], toks[2:]):
                trigrams[f"{a} {b} {c}"] += 1
            lengths.append(len(text))
            token_lens.append(len(toks))
            if text == text.lower():
                lower_msgs += 1
            if text == text.upper() and re.search(r"[A-Z]", text):
                upper_msgs += 1
            if "?" in text:
                quest_msgs += 1
            if any(rex.search(text) for rex in PROF_RE):
                prof_msgs += 1
            prof_tokens += sum(len(rex.findall(text)) for rex in PROF_RE)
            prof_tokens_sub += sum(len(rex.findall(text)) for rex in PROF_RE_SUB)
            if any(re.search(rf"\b{re.escape(t)}\b", low) for t in EN_BROAD):
                en_any_msgs += 1
            if any(re.search(rf"\b{re.escape(t)}\b", low) for t in EN_STRICT):
                en_strict_msgs += 1
            ems = EMOJI_RE.findall(text)
            ems = [e for e in ems if e not in ("\ufe0f", "\u200d")]
            if ems:
                emoji_msgs += 1
                emoji_counter.update(ems)
        if "@" in text:
            mention_msgs += 1
        if "http" in text or "www." in text:
            link_msgs += 1

    # bursts: same-sender consecutive non-deleted user messages, gap <= 60 s
    non_deleted = [r for r in user if r["type"] != "deleted"]
    bursts = []
    cur_len = 1
    prev = None
    gaps = []
    for r in non_deleted:
        if prev is not None and r["sender_key"] == prev["sender_key"] and prev["ts"]:
            g = (datetime.fromisoformat(r["ts"]) - datetime.fromisoformat(prev["ts"])).total_seconds()
            if g <= 60:
                cur_len += 1
                gaps.append(g)
                prev = r
                continue
        bursts.append(cur_len) if prev is not None else None
        cur_len = 1
        prev = r
    if prev is not None:
        bursts.append(cur_len)
    burst_dist = collections.Counter(bursts)
    b_clamped = {k: v for k, v in burst_dist.items() if k < 6}
    b_clamped[6] = sum(v for k, v in burst_dist.items() if k >= 6)
    burst_pct = {("6" if k == 6 else str(k)): pct(v, len(bursts)) for k, v in sorted(b_clamped.items())}

    def jaccard_top80(a, b):
        ta = {t for t, _ in a.most_common(80)}
        tb = {t for t, _ in b.most_common(80)}
        return ds.jaccard(ta, tb)

    top_tokens = tok_counter.most_common(60)
    short_top = [[t, c] for t, c in tok_counter.most_common(400) if len(t) <= 4][:40]
    vowelless_top = [[t, c] for t, c in tok_counter.most_common(800)
                     if len(t) >= 5 and not re.search(r"[aeiou]", t)][:30]

    quiet = sum(v for k, v in hourly.items() if k in {"23", "00", "01", "02", "03", "04", "05", "06"})
    stats = {
        "identity": {
            "archive_file": "WhatsApp Chat with AVOID PRIME  FT.txt",
            "group_created_line": '~ Apip created group "AVOID PRIME | FT"',
            "community_line": "[number] added you to a group in the community: AVOID CITY",
            "subject_changes": 0,
            "mentions_gb_prime": phrase_counts["gb prime"],
            "gb_prime_status": "colloquial reference to Grup Besar Prime within the same AVOID CITY community — NOT a foreign community",
            "mentions_avoid": counts["avoid"] + counts["avo"] + counts["prime"],
            "mentions_fp_token": counts["fp"],
        },
        "totals": {
            "messages_parsed": len(rows),
            "user_messages": len(user),
            "system_messages": len(system),
            "text_messages": len(texts),
            "media_messages": sum(1 for r in user if r["type"] == "media"),
            "empty_messages": sum(1 for r in user if r["type"] == "empty"),
            "deleted_placeholders": sum(1 for r in user if r["type"] == "deleted"),
            "participants": _participants_count(args.out),
            "first_ts": user[0]["ts"] if user else None,
            "last_ts": user[-1]["ts"] if user else None,
            "days_active": len(days),
            "messages_per_active_day": round(len(user) / max(1, len(days)), 1),
            "duplicate_consecutive": sum(1 for r in user if r["duplicate"]),
        },
        "participation": _participation(args.out, len(user)),
        "time": {
            "hour_histogram": dict(sorted(hourly.items())),
            "weekday": {k: weekly[k] for k in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]},
            "month": dict(sorted(monthly.items())),
            "quiet_23_to_07_pct": pct(quiet, len(user)),
        },
        "bursts": {
            "count": len(bursts),
            "length_distribution_pct": burst_pct,
            "median_gap_seconds_within_burst": median(gaps),
            "p90_gap_seconds_within_burst": sorted(gaps)[int(0.9 * len(gaps))] if gaps else 0,
        },
        "length": {
            "chars_p10_p50_p90": [_pctl(lengths, q) for q in (10, 50, 90)],
            "tokens_p10_p50_p90": [_pctl(token_lens, q) for q in (10, 50, 90)],
            "pct_up_to_3_tokens": pct(sum(1 for t in token_lens if t <= 3), len(token_lens)),
            "pct_15_plus_tokens": pct(sum(1 for t in token_lens if t >= 15), len(token_lens)),
            "pct_all_lowercase": pct(lower_msgs, len(texts)),
            "pct_all_uppercase": pct(upper_msgs, len(texts)),
            "pct_has_question_mark": pct(quest_msgs, len(texts)),
        },
        "formatting": {
            "pct_with_emoji": pct(emoji_msgs, len(texts)),
            "pct_has_mention": pct(mention_msgs, len(user)),
            "pct_with_link": pct(link_msgs, len(user)),
        },
        "media": {
            "msgs": sum(1 for r in user if r["type"] == "media"),
            "types": dict(media_types.most_common()),
            "with_caption": media_captions,
        },
        "top_tokens": [[t, c] for t, c in top_tokens],
        "short_tokens_top": short_top,
        "vowel_less_tokens_top": vowelless_top,
        "top_bigrams": [[b, c] for b, c in bigrams.most_common(40)],
        "top_trigrams": [[t, c] for t, c in trigrams.most_common(30)],
        "term_counts": {**{t: c for t, c in counts.items()}, **phrase_counts},
        "laughter": {"wkwk_family_msgs": wk_count, "awok_msgs": awok_count,
                     "haha_family_msgs": haha_count, "lol_lmao_msgs": lol_count},
        "profanity": {"total_tokens": prof_tokens, "msgs_pct": pct(prof_msgs, len(texts)),
                      "per_1k_text_messages": round(1000.0 * prof_tokens / max(1, len(texts)), 1),
                      "substring_variant_tokens": prof_tokens_sub,
                      "list_terms": len(PROFANITY)},
        "english_switch": {"any_pct": pct(en_any_msgs, len(texts)),
                           "strict_pct": pct(en_strict_msgs, len(texts)),
                           "broad_list": EN_BROAD, "strict_list": EN_STRICT},
        "emoji": {"total": sum(emoji_counter.values()), "distinct": len(emoji_counter),
                  "msgs_with_emoji": emoji_msgs,
                  "top": [[e, c] for e, c in emoji_counter.most_common(30)]},
        "drift": {"jaccard_top80_first_third_vs_last_third": round(jaccard_top80(thirds_tokens[0], thirds_tokens[2]), 3)},
        "system_events": dict(collections.Counter(r["event_type"] for r in system)),
        "methodology": {
            "tokenizer": "lowercase word tokens (unicode \\w) on text_normalized",
            "term_counts": "word-boundary regex per term, case-insensitive, message-level",
            "bursts": "same-sender consecutive user messages, gap <= 60 s",
            "drift": "top-80 token set Jaccard, corpus thirds by message order",
            "emoji": "Unicode emoji-range chars, FE0F/ZWJ excluded",
            "timestamp_tz": "as exported, assumed WIB (UTC+7)",
        },
    }
    ds.dump_json(os.path.join(args.out, "statistics.json"), stats)

    profile = {
        "community": "AVOID PRIME | FT",
        "generated_from": "data/seed/statistics.json",
        "register": {"first_person": {"gw": counts["gw"], "aku": counts["aku"], "saya": counts["saya"]},
                     "second_person": {"lu": counts["lu"], "kamu": counts["kamu"]},
                     "negation": {k: counts[k] for k in ["ga", "gk", "kaga", "gak"]},
                     "interjections": {k: counts[k] for k in ["jir", "wok", "yak", "sih", "dong", "deh"]},
                     "agreement": {k: counts[k] for k in ["bet", "siap", "yoi", "ok", "oke"]}},
        "laughter": {"wkwk_family": wk_count, "haha_family": haha_count, "lol": lol_count},
        "emoji_top": [[e, c] for e, c in emoji_counter.most_common(10)],
        "signature_terms": {k: counts[k] for k in ["mandul", "gas", "spar", "kiper", "yonkou強", "ambaking", "fp"]},
        "english_mixing": {"any_pct": stats["english_switch"]["any_pct"],
                           "strict_pct": stats["english_switch"]["strict_pct"]},
        "rhythm": {"chars_p50": stats["length"]["chars_p10_p50_p90"][1],
                   "pct_up_to_3_tokens": stats["length"]["pct_up_to_3_tokens"],
                   "burst_1_2_pct": round(burst_pct.get("1", 0) + burst_pct.get("2", 0), 1),
                   "peak_hours": sorted(hourly.items(), key=lambda kv: -kv[1])[:3],
                   "quiet_23_07_pct": stats["time"]["quiet_23_to_07_pct"]},
        "profanity_msgs_pct": stats["profanity"]["msgs_pct"],
        "drift_jaccard": stats["drift"]["jaccard_top80_first_third_vs_last_third"],
    }
    ds.dump_json(os.path.join(args.out, "language-profile.json"), profile)

    # old-vs-new comparison
    comparison = []
    old = None
    if args.old and os.path.exists(args.old):
        old = json.load(open(args.old))
        pairs = [
            ("totals.messages_parsed", old["totals"]["messages_parsed"], stats["totals"]["messages_parsed"]),
            ("totals.user_messages", old["totals"]["user_messages"], stats["totals"]["user_messages"]),
            ("totals.system_messages", old["totals"]["system_messages"], stats["totals"]["system_messages"]),
            ("totals.deleted_placeholders", old["totals"]["deleted_placeholders"], stats["totals"]["deleted_placeholders"]),
            ("totals.participants", old["totals"]["participants"], stats["totals"]["participants"]),
            ("totals.days_active", old["totals"]["days_active"], stats["totals"]["days_active"]),
            ("time.quiet_23_to_07_pct", old["time"]["quiet_23_to_07_pct"], stats["time"]["quiet_23_to_07_pct"]),
            ("bursts.count", old["bursts"]["count"], len(bursts)),
            ("emoji.total", old["emoji"]["total"], stats["emoji"]["total"]),
            ("emoji.distinct", old["emoji"]["distinct"], stats["emoji"]["distinct"]),
            ("emoji.top1", old["emoji"]["top"][0][1], stats["emoji"]["top"][0][1]),
            ("profanity.total_tokens", old["profanity"]["total_tokens"], prof_tokens),
            ("profanity.msgs_pct", old["profanity"]["msgs_pct"], stats["profanity"]["msgs_pct"]),
            ("drift.jaccard", old["drift"]["jaccard_top80_first_third_vs_last_third"], stats["drift"]["jaccard_top80_first_third_vs_last_third"]),
            ("laughter.wkwk_family", old.get("laughter", {}).get("families", {}).get("wkwk-family"), wk_count),
            ("length.chars_p50", old.get("length", {}).get("chars_p10_p50_p90", [None])[1], stats["length"]["chars_p10_p50_p90"][1]),
            ("length.pct_up_to_3_tokens", old.get("length", {}).get("pct_up_to_3_tokens"), stats["length"]["pct_up_to_3_tokens"]),
            ("length.pct_15_plus_tokens", old.get("length", {}).get("pct_15_plus_tokens"), stats["length"]["pct_15_plus_tokens"]),
            ("length.pct_all_lowercase", old.get("formatting", {}).get("pct_all_lowercase"), stats["length"]["pct_all_lowercase"]),
            ("length.pct_all_uppercase", old.get("formatting", {}).get("pct_all_uppercase"), stats["length"]["pct_all_uppercase"]),
            ("formatting.pct_with_emoji", old.get("formatting", {}).get("pct_with_emoji"), stats["formatting"]["pct_with_emoji"]),
            ("formatting.pct_has_question_mark", old.get("formatting", {}).get("pct_has_question_mark"), stats["length"]["pct_has_question_mark"]),
            ("participation.top1_share_pct", old["participation"]["top1_share_pct"], stats["participation"]["top1_share_pct"]),
            ("participation.top5_share_pct", old["participation"]["top5_share_pct"], stats["participation"]["top5_share_pct"]),
            ("participation.top10_share_pct", old["participation"]["top10_share_pct"], stats["participation"]["top10_share_pct"]),
            ("identity.mentions_gb_prime", old["identity"]["mentions_gb_prime"], stats["identity"]["mentions_gb_prime"]),
        ]
        for name, o, n in pairs:
            status = "match" if (o == n or (isinstance(o, (int, float)) and isinstance(n, (int, float)) and abs(float(o) - float(n)) <= 0.15)) else "diff"
            comparison.append({"metric": name, "old": o, "new": n, "status": status})
        old_hour = old["time"]["hour_histogram"]
        hour_match = all(old_hour.get(k, 0) == v for k, v in stats["time"]["hour_histogram"].items())
        comparison.append({"metric": "time.hour_histogram", "old": "24-bucket", "new": "24-bucket",
                           "status": "match" if hour_match else "diff",
                           "note": "" if hour_match else _first_hour_diff(old_hour, stats["time"]["hour_histogram"])})
        for k in ["text_messages"]:
            o_txt = old["totals"].get(k)
            comparison.append({"metric": f"totals.{k}", "old": o_txt, "new": stats["totals"][k],
                               "status": "match" if o_txt == stats["totals"][k] else "diff",
                               "note": "old text = new text +3 caption-boundary msgs; old media 7270 = new 7024 + 249 empty-body msgs (now type=empty)"})
        old_media = old["totals"]["user_messages"] - old["totals"]["deleted_placeholders"] - old["totals"]["text_messages"]
        comparison.append({"metric": "media.msgs", "old": old_media, "new": stats["totals"]["media_messages"] + stats["totals"]["empty_messages"],
                           "status": "match" if old_media == stats["totals"]["media_messages"] + stats["totals"]["empty_messages"] else "diff",
                           "note": "old classified empty-body export lines as media; new tracks them as type=empty"})
        old_top8 = {t for t, _ in old.get("top_tokens", [])[:8]}
        new_top8 = {t for t, _ in stats["top_tokens"][:8]}
        comparison.append({"metric": "top_tokens.top8_overlap", "old": len(old_top8), "new": len(old_top8 & new_top8),
                           "status": "match" if old_top8 == new_top8 else "diff"})
    ds.dump_json(os.path.join(args.out, "comparison.json"),
                 {"generated_from": "stage 3", "old_source": os.path.basename(args.old) if old else None,
                  "summary_match": sum(1 for c in comparison if c["status"] == "match"),
                  "summary_diff": sum(1 for c in comparison if c["status"] == "diff"),
                  "items": comparison})
    print(f"stats written; comparison: {sum(1 for c in comparison if c['status']=='match')} match / "
          f"{sum(1 for c in comparison if c['status']=='diff')} diff")
    for c in comparison:
        if c["status"] == "diff":
            print(f"  DIFF {c['metric']}: old={c['old']} new={c['new']} {c.get('note','')}")


MEDIA_PLACEHOLDER_CAPTION_RE = re.compile(r"^(?!<Media omitted>)\S")


def _participants(path_seed):
    data = json.load(open(os.path.join(path_seed, "participants.json")))
    return data["participants"]


def _participants_count(path_seed):
    try:
        return json.load(open(os.path.join(path_seed, "participants.json")))["count"]
    except FileNotFoundError:
        return -1


def _participation(path_seed, total_user):
    try:
        parts = [p["messages"] for p in _participants(path_seed)]
    except FileNotFoundError:
        return {}
    top1 = sum(parts[:1]); top5 = sum(parts[:5]); top10 = sum(parts[:10])
    return {"top1_share_pct": pct(top1, total_user), "top5_share_pct": pct(top5, total_user),
            "top10_share_pct": pct(top10, total_user),
            "contribution_buckets": json.load(open(os.path.join(path_seed, "participants.json")))["participation_buckets"]}


def _first_hour_diff(oldh, newh):
    for k in sorted(set(oldh) | set(newh)):
        if oldh.get(k, 0) != newh.get(k, 0):
            return f"hour {k}: old={oldh.get(k,0)} new={newh.get(k,0)}"
    return ""


if __name__ == "__main__":
    main()
