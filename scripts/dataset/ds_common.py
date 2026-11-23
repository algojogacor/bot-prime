"""Shared library for the Omak community-dataset pipeline.

Source of truth: the original WhatsApp chat export of AVOID PRIME | FT
(in the WhatsApp community AVOID CITY). Every derived artifact must be
reproducible from that file using the scripts in this directory.

Sanitization policy (applied to every artifact that leaves the workspace):
  - Senders that appear as unsaved phone numbers get a deterministic
    pseudonym key; the raw number never leaves the workspace.
  - Phone numbers inside message text are replaced with [no-diredam].
  - Display names participants chose in the group are kept (alias mapping).
The raw archive itself is never committed to the repository.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime

PARSER_VERSION = "1.0.0"
KEY_SALT = "avoid-prime-ft|"

ARCHIVE_DEFAULT = "/home/z/my-project/.work/archive-avoid-prime/WhatsApp Chat with AVOID PRIME  FT.txt"
SEED_DEFAULT = "/home/z/my-project/bot-prime/data/seed"
WORK_DEFAULT = "/home/z/my-project/.work/dataset-private"

# --- sanitization ------------------------------------------------------------

# Zero-width / bidi control characters (WhatsApp mention isolates etc.)
_CTRL_RE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]")

# Phone-like patterns seen in this export (intl with spaces/hyphens, local 08xx,
# compact 62xx / 08xx runs).
_PHONE_PATTERNS = [
    re.compile(r"\+\d{1,3}\s?\d{3}[\s-]?\d{3,4}(?:[\s-]?\d{3,5})?"),
    re.compile(r"\b0\d{2,3}[\s-]\d{3,4}[\s-]\d{3,5}\b"),
    re.compile(r"\b08\d{8,12}\b"),
    re.compile(r"\b62\d{9,13}\b"),
]
PHONE_TOKEN = "[no-diredam]"


def mask_phone_digits(raw: str) -> str:
    """Mask a raw sender number for public alias display: keep +CC and last 2 digits."""
    digits = re.sub(r"\D", "", raw)
    cc = raw.strip().startswith("+")
    keep = digits[-2:] if len(digits) >= 2 else ""
    return ("+CC " if cc else "") + "\u2022" * 8 + keep


def sanitize_text(text: str) -> str:
    """Strip bidi/isolate control chars and mask phone numbers (text goes public)."""
    out = _CTRL_RE.sub("", text)
    for pat in _PHONE_PATTERNS:
        out = pat.sub(PHONE_TOKEN, out)
    return out


def sender_key(raw_sender: str) -> str:
    """Deterministic pseudonym key for a raw sender string."""
    h = hashlib.sha256((KEY_SALT + raw_sender).encode("utf-8")).hexdigest()
    return "p-" + h[:10]


# --- parsing -----------------------------------------------------------------

TS_RE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4}),\s*(\d{1,2}):(\d{2})\s*-\s(.*)$", re.S)
SENDER_SPLIT_RE = re.compile(r"^(.*?):\s?(.*)$", re.S)
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# System-event detection. Applied to the sender candidate; if it matches, the
# payload is a WhatsApp system event, not a user message.
SYSTEM_VERBS = [
    ("group_created", r"created group"),
    ("community_notice", r"added you to a group in the community"),
    ("member_added", r"\sadded\s"),
    ("member_joined", r"joined"),
    ("member_left", r"\sleft\b"),
    ("member_removed", r"was removed|\sremoved\s"),
    ("admin_approval", r"turned (?:on|off) admin approval"),
    ("group_settings", r"changed this group's|changed the group|changed the settings|changed the description|changed the subject|changed the icon|deleted this group's|allowed only admins|so only admins"),
    ("encryption_notice", r"Messages and calls are end-to-end encrypted"),
    ("missed_call", r"^Missed (?:voice|video|group)"),
    ("security_notice", r"security code"),
    ("phone_change", r"changed their phone number"),
    ("message_history_setting", r"send message history to new members"),
]
SYSTEM_VERB_RE = re.compile("|".join(r"(?:%s)" % v for _, v in SYSTEM_VERBS), re.I)

DELETED_TEXTS = {"This message was deleted", "You deleted this message"}
MEDIA_PATTERNS = [
    ("image", r"<Media omitted>|image omitted|\(file attached\)|IMG-\d{4,}-WA\d+\.|IMAGE-"),
    ("video", r"video omitted|VID-\d{4,}-WA|\.mp4"),
    ("audio", r"audio omitted|PTT-\d{4,}-WA|\.opus|\.ogg"),
    ("sticker", r"sticker omitted"),
    ("gif", r"GIF omitted"),
    ("document", r"document omitted|\.pdf|\.xlsx?|\.docx?|\.zip\b"),
    ("contact", r"Contact card omitted"),
    ("location", r"location omitted|Live location"),
]
MEDIA_RE = [(k, re.compile(v, re.I)) for k, v in MEDIA_PATTERNS]


def classify_event(payload: str) -> str | None:
    for name, verb in SYSTEM_VERBS:
        if re.search(verb, payload, re.I):
            return name
    return None


@dataclass
class Record:
    seq: int
    ts: datetime | None
    is_system: bool
    event_type: str | None
    raw_sender: str | None  # as exported (private; never serialized to seed)
    kind: str               # text | media | deleted | system
    media: list[str] = field(default_factory=list)
    lines: list[str] = field(default_factory=list)
    line_start: int = 0
    line_end: int = 0
    duplicate: bool = False


def parse_export(path: str):
    """Yield Record objects from a WhatsApp .txt export.

    Handles: multiline messages, system events, deleted-message placeholders,
    media placeholders, Unicode isolate characters in mentions.
    Timestamps are kept exactly as exported (local device time, assumed WIB/UTC+7).
    """
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        raw_lines = fh.read().splitlines()

    records: list[Record] = []
    cur: Record | None = None
    diagnostics: list[dict] = []
    blank_lines = 0

    for lineno, raw in enumerate(raw_lines, 1):
        line = raw.rstrip("\r")
        stripped = line.strip()
        if not stripped:
            blank_lines += 1
            continue
        clean = _CTRL_RE.sub("", stripped)
        m = TS_RE.match(clean)
        if not m:
            if cur is not None:
                cur.lines.append(sanitize_text(stripped))
                cur.line_end = lineno
            else:
                diagnostics.append({"line": lineno, "reason": "orphan_before_first_message", "text": sanitize_text(stripped)[:200]})
            continue

        d, mo, y, hh, mm, payload = m.groups()
        try:
            ts = datetime(int(y), int(mo), int(d), int(hh), int(mm))
        except ValueError:
            diagnostics.append({"line": lineno, "reason": "invalid_date", "text": sanitize_text(payload)[:120]})
            continue

        # flush previous record
        if cur is not None:
            records.append(cur)
            cur = None

        sm = SENDER_SPLIT_RE.match(payload)
        raw_sender, body = (sm.group(1).strip(), sm.group(2)) if sm else (None, payload)
        event_type = classify_event(payload) if sm else classify_event(payload)
        if sm and SYSTEM_VERB_RE.search(raw_sender):
            is_system = True
        elif sm is None:
            is_system = True
        else:
            is_system = False
            event_type = None

        if is_system:
            cur = Record(seq=0, ts=ts, is_system=True, event_type=event_type or "other_system",
                         raw_sender=None, kind="system", lines=[sanitize_text(payload)],
                         line_start=lineno, line_end=lineno)
            continue

        media = [k for k, rex in MEDIA_RE if rex.search(body)]
        if body.strip() in DELETED_TEXTS:
            kind = "deleted"
        elif media:
            kind = "media"
        elif not sanitize_text(body).strip():
            kind = "empty"  # renders as nothing in the text export (view-once media, some stickers)
        else:
            kind = "text"
        cur = Record(seq=0, ts=ts, is_system=False, event_type=None,
                     raw_sender=raw_sender, kind=kind, media=media,
                     lines=[sanitize_text(body.strip())],
                     line_start=lineno, line_end=lineno)

    if cur is not None:
        records.append(cur)

    # assign sequential ids + duplicate detection (identical consecutive records)
    for i, rec in enumerate(records, 1):
        rec.seq = i
    prev = None
    for rec in records:
        if (prev is not None and prev.ts == rec.ts and prev.raw_sender == rec.raw_sender
                and prev.lines == rec.lines and not prev.is_system and not rec.is_system):
            rec.duplicate = True
        prev = rec

    meta = {
        "total_lines": len(raw_lines),
        "blank_lines": blank_lines,
        "records": len(records),
        "diagnostics": diagnostics,
    }
    return records, meta


def normalize_text(lines: list[str]) -> str:
    """Whitespace-collapsed, isolate-free text used for language statistics."""
    joined = " ".join(lines)
    return re.sub(r"\s+", " ", joined).strip()


def tokenize(text: str) -> list[str]:
    import unicodedata
    return re.findall(r"[\w\u00c0-\u024f\u0660-\u0669]+", unicodedata.normalize("NFKC", text).lower(), re.UNICODE)


def dump_json(path: str, obj) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=1)
        fh.write("\n")


def jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)
