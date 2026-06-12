#!/usr/bin/env python3
"""
Filtering and event extraction component for the Hermes/ChatGPT recap skill.

Reads Foundry VTT messages.db (NDJSON / NeDB format), applies the
17-rule story-filtering policy from parent task t_d4ee245d, and produces
structured story-relevant event records suitable for narrative recap writing.

Usage:
    python3 extract_events.py --messages-db /path/to/messages.db [--output events.json]
    python3 extract_events.py --messages-db /path/to/messages.db --dry-run
    python3 extract_events.py --messages-db /path/to/messages.db --include-whispers
    python3 extract_events.py --messages-db /path/to/messages.db --debug
"""

import argparse
import json
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional

# ── Foundry v13 ChatMessage types ──
MSG_IC = 0
MSG_EMOTE = 1
MSG_SYSTEM = 2
MSG_OOC = 4
MSG_DICE_ROLL = 5

TYPE_LABELS = {
    MSG_IC: "ic", MSG_EMOTE: "emote", MSG_SYSTEM: "system",
    MSG_OOC: "ooc", MSG_DICE_ROLL: "dice_roll",
}

EVENT_CATEGORIES = [
    "COMBAT", "CHARACTER_MOMENT", "DISCOVERY", "NPC_INTERACTION",
    "DUNGEONEERING", "SPIRITUAL", "LORE_FRAGMENT", "PLOT_TURN",
    "ITEM_ACQUIRED", "UNRESOLVED_THREAD", "DM_COMMENTARY",
]

CONF_FULL = "FULL"
CONF_STRONG = "STRONG"
CONF_GUESS = "GUESS"


# ═══════════════════════════════════════════════
# Raw Message from NDJSON
# ═══════════════════════════════════════════════

@dataclass
class RawMessage:
    msg_id: str
    msg_type: int
    timestamp: int
    user: str
    content: str
    flavor: str
    speaker_alias: str
    speaker_actor: Optional[str]
    speaker_scene: Optional[str]
    whisper: list
    is_blind: bool
    is_emote: bool
    rolls_raw: list
    flags: dict

    @classmethod
    def from_ndjson(cls, line: str, line_number: int) -> "RawMessage":
        obj = json.loads(line)
        speaker = obj.get("speaker") or {}
        return cls(
            msg_id=obj.get("_id", f"line_{line_number}"),
            msg_type=obj.get("type", 4),
            timestamp=obj.get("timestamp", 0),
            user=obj.get("user", ""),
            content=obj.get("content", ""),
            flavor=obj.get("flavor", ""),
            speaker_alias=speaker.get("alias", ""),
            speaker_actor=speaker.get("actor"),
            speaker_scene=speaker.get("scene"),
            whisper=obj.get("whisper", []),
            is_blind=obj.get("blind", False),
            is_emote=obj.get("emote", False),
            rolls_raw=obj.get("rolls", []),
            flags=obj.get("flags", {}),
        )


# ═══════════════════════════════════════════════
# Parsed Roll
# ═══════════════════════════════════════════════

@dataclass
class ParsedRoll:
    formula: str
    total: float
    dice_count: int
    faces: int
    is_critical: bool = False
    is_fumble: bool = False
    results: list = field(default_factory=list)

    @classmethod
    def from_json(cls, raw: str) -> Optional["ParsedRoll"]:
        try:
            obj = json.loads(raw)
            formula = obj.get("formula", "")
            terms = obj.get("terms", [])
            dice_count = 0
            faces = 0
            results = []
            for term in terms:
                if term.get("class") in ("Die", "DieModifier"):
                    dice_count = term.get("number", 1)
                    faces = term.get("faces", 0)
                    for r in term.get("results", []):
                        results.append({
                            "result": r.get("result"),
                            "active": r.get("active", False),
                        })
            total = obj.get("total", 0)
            is_crit = bool(faces == 20 and dice_count == 1 and total == 20)
            is_fumb = bool(faces == 20 and dice_count == 1 and total == 1)
            return cls(
                formula=formula, total=total,
                dice_count=dice_count, faces=faces,
                is_critical=is_crit, is_fumble=is_fumb,
                results=results,
            )
        except (json.JSONDecodeError, KeyError, TypeError):
            return None


# ═══════════════════════════════════════════════
# Classified Message
# ═══════════════════════════════════════════════

@dataclass
class ClassifiedMessage:
    raw: RawMessage
    parsed_rolls: list[ParsedRoll] = field(default_factory=list)
    is_mechanical: bool = False
    is_dramatic_roll: bool = False
    is_initiative: bool = False
    is_damage_roll: bool = False
    is_skill_check: bool = False
    is_spell_cast: bool = False
    is_d100_roll: bool = False
    is_combat_related: bool = False
    is_turn_marker: bool = False
    is_whisper: bool = False
    has_game_content: bool = False
    content_class: str = "unknown"


# ═══════════════════════════════════════════════
# StoryEvent — the output
# ═══════════════════════════════════════════════

@dataclass
class StoryEvent:
    event_id: str
    category: str
    timestamp: int
    session_hint: str
    source_type: str
    source_message_id: str
    summary: str
    detail: str
    confidence: str
    reliability_note: str
    actors_involved: list
    mechanical_detail: Optional[list] = None
    provenance: dict = field(default_factory=dict)


# ═══════════════════════════════════════════════
# Stage 1: Ingestion
# ═══════════════════════════════════════════════

def ingest(path: str) -> list[RawMessage]:
    msgs = []
    with open(path) as f:
        for ln, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                msgs.append(RawMessage.from_ndjson(line, ln))
            except json.JSONDecodeError as e:
                print(f"  [WARN] line {ln}: {e}", file=sys.stderr)
    return msgs


# ═══════════════════════════════════════════════
# Stage 2: Classification
# ═══════════════════════════════════════════════

def classify(msg: RawMessage) -> ClassifiedMessage:
    cm = ClassifiedMessage(raw=msg)

    if msg.whisper:
        cm.is_whisper = True

    for r_raw in msg.rolls_raw:
        if isinstance(r_raw, str):
            pr = ParsedRoll.from_json(r_raw)
            if pr:
                cm.parsed_rolls.append(pr)

    # Check if flavor or content mentions initiative
    if "initiative" in (msg.flavor + " " + msg.content).lower():
        cm.is_initiative = True
        cm.is_combat_related = True

    for pr in cm.parsed_rolls:
        if pr.faces == 100:
            cm.is_d100_roll = True
            cm.is_mechanical = True
        if pr.faces in (4, 6, 8, 10, 12) and pr.dice_count >= 1:
            cm.is_damage_roll = True
            cm.is_combat_related = True
            cm.is_mechanical = True
        if pr.faces == 20:
            cm.is_skill_check = True
            cm.is_combat_related = True
            cm.is_mechanical = True
        if pr.is_critical or pr.is_fumble:
            cm.is_dramatic_roll = True

    mt = msg.msg_type

    if mt == MSG_SYSTEM:
        cm.content_class = "system"
        # Filter system whisper commands (w/, /w, \w) and short noise
        sys_clean = re.sub(r"\s+", " ", msg.content).strip()
        sys_noise = (
            not sys_clean
            or len(sys_clean) <= 3
            or re.match(r"^\\?w/?\s*$", sys_clean, re.IGNORECASE)
            or re.match(r"^w/\s*\w", sys_clean, re.IGNORECASE)
            or re.match(r"^/\s*\w", sys_clean, re.IGNORECASE)
            or re.search(r"\w+@\w+\.\w+", sys_clean)
            or re.search(r"https?://", sys_clean)
        )
        if not sys_noise:
            cm.is_mechanical = True
            if "turn" in msg.content.lower():
                cm.is_turn_marker = True
                cm.is_combat_related = True
            cm.has_game_content = True

    elif mt == MSG_DICE_ROLL:
        cm.is_mechanical = True
        cm.has_game_content = True
        cm.content_class = "mechanical"

    elif mt == MSG_EMOTE:
        bl = msg.content.lower()
        # Banter detection for emotes (same logic as IC)
        clean_emote = re.sub(r"\s+", " ", msg.content).strip()
        is_banter_emote = False
        if len(clean_emote) <= 3:
            is_banter_emote = True
        elif re.search(r"\w+@\w+\.\w+", clean_emote):
            is_banter_emote = True
        elif re.match(r"^\s*(?:/w\b|w/\s|w /\s|/ \w)", clean_emote, re.IGNORECASE):
            is_banter_emote = True
        elif re.match(
            r"^\s*(?:test|kk|ok|lol|haha|hi|hey|yes|no|thanks|ty|nope|yeah|nah|lmao|rofl)\s*$",
            clean_emote, re.IGNORECASE,
        ):
            is_banter_emote = True

        if not is_banter_emote:
            cm.has_game_content = True
            cm.content_class = "narrative"
            if any(w in bl for w in ("attack","strike","hit","slash","shoot",
                                     "cast","fire","draw","ready","move",
                                     "approach","step","kick","punch")):
                cm.is_combat_related = True
        else:
            cm.content_class = "banter"
            cm.has_game_content = False

    elif mt == MSG_IC:
        bl = msg.content.lower()
        # Strip HTML, check if there's actual narrative content
        clean = re.sub(r"<[^>]+>", " ", msg.content).strip()
        clean = re.sub(r"\s+", " ", clean).strip()

        # Detect combat turn markers (HTML with "Turn" heading)
        if re.search(r"<h2>[^<]*[Tt]urn</h2>", msg.content):
            cm.is_turn_marker = True
            cm.is_combat_related = True
            cm.has_game_content = True
            cm.content_class = "mechanical"

        # Detect banter/empty IC: empty, email addresses, "/w" or "w/" whisper
        # commands, slash commands, short casual responses, or known noise
        stripped_clean = clean.strip()

        is_banter = False
        if not stripped_clean or len(stripped_clean) <= 3:
            is_banter = True
        elif re.search(r"\w+@\w+\.\w+", stripped_clean):
            is_banter = True  # email address
        elif re.match(r"^\s*(?:/w\b|w/\s|w /\s|/ \w)", stripped_clean, re.IGNORECASE):
            is_banter = True  # whisper command
        elif re.match(
            r"^\s*(?:test|kk|ok|lol|haha|hi|hey|yes|no|thanks|ty|"
            r"sure|nope|yeah|nah|lmao|rofl|nvm)\s*$",
            stripped_clean, re.IGNORECASE,
        ):
            is_banter = True  # single-word response

        if not is_banter:
            cm.has_game_content = True
            cm.content_class = "narrative"
            if any(w in bl for w in ("attack","hit","kill","damage","strike")):
                cm.is_combat_related = True
        else:
            cm.content_class = "banter"
            cm.has_game_content = False

    elif mt == MSG_OOC:
        cm.content_class = "banter"
        bl = msg.content.lower()
        if any(w in bl for w in ("rule","roll","check","save","damage",
                                 "hit points","level","spell","attack",
                                 "ac","armor class")):
            cm.has_game_content = True
            cm.content_class = "mechanical_discussion"
            cm.is_mechanical = True

    return cm


# ═══════════════════════════════════════════════
# Stage 3: Filtering (17 rules)
# ═══════════════════════════════════════════════

_GAME_ACTION_RE = re.compile(
    r"(attack|hit |miss|killed|slay|damage|heal|cast|spell|save|"
    r"check|search|open|push|pull|climb|jump|sneak|hide|listen|"
    r"spot|track|find|discover|take|grab|steal|buy|sell|trade|"
    r"talk|speak|ask|tell|reveal|confess|admit|"
    r"trap|poison|curse|disease|wound|injury|"
    r"treasure|gold|coin|loot|item|equip|buy)",
    re.IGNORECASE,
)

_TECH_RE = re.compile(r"\b(mic|audio|sound|discord|can you hear|test|connection|lag)\b", re.IGNORECASE)
_SCHED_RE = re.compile(r"\b(next session|schedule|same time|next week|cancel|reschedule)\b", re.IGNORECASE)
_JOKE_RE = re.compile(r"\b(lol|lmao|rofl|haha|jk|that's funny)\b", re.IGNORECASE)
_ITEM_RE = re.compile(r"\b(treasure|gold|coin|item|loot|buy|sell|equip|wound|injury|die|dying|death)\b", re.IGNORECASE)


def filter_message(cm: ClassifiedMessage) -> tuple[str, str]:
    """(keep|drop, rationale)."""
    msg = cm.raw
    cl = msg.content.lower()

    # D6: Whispers
    if cm.is_whisper:
        return ("drop", "D6: whisper")

    # D4: Scheduling
    if _SCHED_RE.search(cl):
        return ("drop", "D4: scheduling")

    # D2: Technical issues
    if _TECH_RE.search(cl) and not cm.has_game_content:
        return ("drop", "D2: tech issue")

    # D5/D1: OOC banter without game content
    if msg.msg_type == MSG_OOC and not cm.has_game_content:
        return ("drop", "D5/D1: banter/off-topic")

    # D3: Unrelated jokes (OOC with joke markers, no game refs)
    if msg.msg_type == MSG_OOC and _JOKE_RE.search(cl) and not cm.has_game_content:
        return ("drop", "D3: unrelated joke")

    # ── KEEP rules ──

    if cm.is_mechanical:
        return ("keep", "K4: mechanical event")

    if cm.is_dramatic_roll:
        return ("keep", "K11: dramatic dice")

    if cm.is_damage_roll or cm.is_skill_check or cm.is_spell_cast:
        return ("keep", "K10/K7: combat/check/spell")

    if cm.is_combat_related and cm.has_game_content:
        return ("keep", "K7: combat related")

    # IC/Emote: character action, discovery, roleplay
    if msg.msg_type in (MSG_IC, MSG_EMOTE):
        if cm.has_game_content:
            return ("keep", "K5/K8: character action/roleplay")
        if _ITEM_RE.search(cl):
            return ("keep", "K9: item/injury reference")
        if _GAME_ACTION_RE.search(cl):
            return ("keep", "K3: game-relevant")

    # Rules discussion
    if cm.content_class == "mechanical_discussion":
        return ("keep", "K2: rules discussion")

    # Fallback: drop
    return ("drop", "D5: default — no game content")


# ═══════════════════════════════════════════════
# Stage 4: Event extraction
# ═══════════════════════════════════════════════

def _session_hint(ts: int) -> str:
    try:
        return datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d")
    except (OSError, ValueError):
        return "unknown"


def _strip_html(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()


def _pick_category(msg: RawMessage, cm: ClassifiedMessage) -> str:
    cl = msg.content.lower()

    if cm.is_initiative:
        return "COMBAT"
    if cm.is_turn_marker:
        return "COMBAT"
    if cm.is_combat_related and cm.parsed_rolls:
        return "COMBAT"
    if cm.is_d100_roll and cm.parsed_rolls:
        return "COMBAT"

    if re.search(r"\b(treasure|gold|coin|item|loot|buy|sell|equip)\b", cl):
        return "ITEM_ACQUIRED"
    if re.search(r"\b(find|discover|spot|notice|reveal|uncover)\b", cl):
        return "DISCOVERY"
    if re.search(r"\b(trap|door|corridor|room|passage|cave|stair|dungeon)\b", cl):
        return "DUNGEONEERING"
    if re.search(r"\b(lore|history|rumor|legend|myth|story|prophecy|god|ancient)\b", cl):
        return "LORE_FRAGMENT"
    if re.search(r"\b(quest|mission|ally|enemy|betray|twist|reveal)\b", cl):
        return "PLOT_TURN"
    if re.search(r"\b(god|pray|bless|curse|omen|vision|dream|divine|shrine)\b", cl):
        return "SPIRITUAL"
    if re.search(r"\b(unresolved|cliffhanger|unknown|mystery|hook)\b", cl):
        return "UNRESOLVED_THREAD"

    if msg.speaker_alias and msg.speaker_alias not in ("", "Paul"):
        # NPC tokens often have parenthetical suffixes like "Cultist(5)"
        if re.search(r"\(\d+\)", msg.speaker_alias):
            return "NPC_INTERACTION"
        return "CHARACTER_MOMENT"
    if msg.msg_type == MSG_EMOTE:
        return "CHARACTER_MOMENT"
    if msg.speaker_alias == "Paul" and msg.msg_type == MSG_OOC:
        return "DM_COMMENTARY"

    if cm.is_mechanical or cm.parsed_rolls:
        return "COMBAT"
    return "CHARACTER_MOMENT"


def _make_summary(msg: RawMessage, cm: ClassifiedMessage) -> str:
    alias = msg.speaker_alias if msg.speaker_alias else "Unknown"
    if cm.is_initiative and cm.parsed_rolls:
        return f"{alias} initiative: {int(cm.parsed_rolls[0].total)}"
    if cm.is_turn_marker:
        return f"Combat round: {alias} — {_strip_html(msg.content)[:80]}"
    if cm.parsed_rolls:
        pr = cm.parsed_rolls[0]
        if pr.is_critical:
            return f"🔥 {alias} CRITICAL HIT! (d20=20)"
        if pr.is_fumble:
            return f"💥 {alias} critical failure (d20=1)"
        if pr.faces == 100:
            return f"{alias} rolled d100: {int(pr.total)}"
        label = "initiative" if cm.is_initiative else f"{pr.dice_count}d{pr.faces}"
        return f"{alias} rolled {int(pr.total)} ({pr.formula})"
    text = _strip_html(msg.content)[:120]
    if alias and alias != "Unknown":
        return f"{alias}: {text}"
    return text


def _make_detail(msg: RawMessage, cm: ClassifiedMessage) -> str:
    parts = []
    for pr in cm.parsed_rolls:
        p = f"Formula: {pr.formula}, Total: {int(pr.total)}"
        if pr.is_critical:
            p += " [CRIT]"
        if pr.is_fumble:
            p += " [FUMBLE]"
        parts.append(p)
    if msg.flavor:
        parts.append(f"Flavor: {msg.flavor}")
    return " | ".join(parts) if parts else _strip_html(msg.content)[:200]


def extract_events(classified: list[ClassifiedMessage]) -> list[StoryEvent]:
    events = []
    cat_counter = Counter()

    for cm in classified:
        decision, rationale = filter_message(cm)
        if decision == "drop":
            continue

        category = _pick_category(cm.raw, cm)

        if cm.is_mechanical:
            confidence = CONF_FULL
            reliability = f"Verified from Foundry message {cm.raw.msg_id}"
        elif cm.raw.msg_type in (MSG_IC, MSG_EMOTE):
            confidence = CONF_STRONG
            reliability = "Heuristic from Foundry chat; cross-ref with transcript for narrative context"
        else:
            confidence = CONF_GUESS
            reliability = f"Best-effort from {TYPE_LABELS.get(cm.raw.msg_type, '?')}"

        cat_counter[category] += 1
        eid = f"evt_{cm.raw.msg_id}_{cat_counter[category]}"

        actors = [cm.raw.speaker_alias] if cm.raw.speaker_alias else []

        mech = None
        if cm.parsed_rolls:
            mech = [
                {
                    "formula": pr.formula,
                    "total": int(pr.total),
                    "dice": f"{pr.dice_count}d{pr.faces}",
                    "is_critical": pr.is_critical,
                    "is_fumble": pr.is_fumble,
                }
                for pr in cm.parsed_rolls
            ]

        events.append(StoryEvent(
            event_id=eid,
            category=category,
            timestamp=cm.raw.timestamp,
            session_hint=_session_hint(cm.raw.timestamp),
            source_type="foundry_chat",
            source_message_id=cm.raw.msg_id,
            summary=_make_summary(cm.raw, cm),
            detail=_make_detail(cm.raw, cm),
            confidence=confidence,
            reliability_note=reliability,
            actors_involved=actors,
            mechanical_detail=mech,
            provenance={
                "message_type": TYPE_LABELS.get(cm.raw.msg_type, f"type_{cm.raw.msg_type}"),
                "decision": decision,
                "rule": rationale,
                "raw_snippet": cm.raw.content[:100],
            },
        ))

    return events


# ═══════════════════════════════════════════════
# Output / Serialization
# ═══════════════════════════════════════════════

def serialize(events: list[StoryEvent]) -> str:
    out = {
        "pipeline": "foundry-event-extractor v1.0",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "total_events": len(events),
        "by_category": dict(Counter(e.category for e in events)),
        "by_confidence": dict(Counter(e.confidence for e in events)),
        "events": [],
    }
    for ev in events:
        d = asdict(ev)
        d["timestamp_human"] = _session_hint(ev.timestamp)
        out["events"].append(d)
    return json.dumps(out, indent=2, default=str)


def print_stats(classified: list[ClassifiedMessage], events: list[StoryEvent]):
    total = len(classified)
    kept = len(events)
    dropped = total - kept

    print(f"═══ Pipeline Summary ═══")
    print(f"Total messages ingested:  {total}")
    print(f"Kept as story events:     {kept}")
    print(f"Dropped by filter:        {dropped}")
    print(f"Keep rate:                {kept/total*100:.1f}%" if total else "")
    print()

    print("Messages by type:")
    tc = Counter(TYPE_LABELS.get(m.raw.msg_type, f"t{m.raw.msg_type}") for m in classified)
    for t, c in sorted(tc.items()):
        print(f"  {t:12s}: {c}")
    print()

    print("Events by category:")
    cc = Counter(e.category for e in events)
    for cat in EVENT_CATEGORIES:
        n = cc.get(cat, 0)
        bar = "█" * (n // 2) if n else ""
        print(f"  {cat:22s}: {n:3d}  {bar}")
    print()

    print("Confidence levels:")
    for lv in (CONF_FULL, CONF_STRONG, CONF_GUESS):
        n = Counter(e.confidence for e in events).get(lv, 0)
        print(f"  {lv:8s}: {n}")


# ═══════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser(description="Extract story events from Foundry messages.db")
    ap.add_argument("--messages-db", "-m", required=True, help="Path to messages.db (NDJSON)")
    ap.add_argument("--output", "-o", default=None, help="Output JSON path (default: stdout)")
    ap.add_argument("--dry-run", action="store_true", help="Stats only, no output")
    ap.add_argument("--include-whispers", action="store_true", help="Include whispers (normally dropped)")
    ap.add_argument("--debug", action="store_true", help="Print each event to stderr")
    args = ap.parse_args()

    db_path = os.path.expanduser(args.messages_db)
    if not os.path.isfile(db_path):
        print(f"Error: {db_path} not found", file=sys.stderr)
        sys.exit(1)

    print(f"Ingesting {db_path}...", file=sys.stderr)
    raw = ingest(db_path)
    print(f"  Parsed {len(raw)} messages", file=sys.stderr)

    classified = [classify(m) for m in raw]
    print(f"  Classified all messages", file=sys.stderr)

    events = extract_events(classified)
    print(f"  Extracted {len(events)} story events", file=sys.stderr)

    if args.debug:
        for ev in events:
            print(f"[{ev.category:22s}] [{ev.confidence:6s}] {ev.summary}", file=sys.stderr)

    print_stats(classified, events)

    if args.dry_run:
        return

    out = serialize(events)
    if args.output:
        with open(os.path.expanduser(args.output), "w") as f:
            f.write(out)
        print(f"Written to {args.output}", file=sys.stderr)
    else:
        print(out)


if __name__ == "__main__":
    main()