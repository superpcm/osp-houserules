#!/usr/bin/env python3
"""
Extract spells from the Advanced Fantasy Player's Tome source JSON
and write a structured spells.json file.
"""

import json
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SOURCE = Path(
    "/home/superpcm/foundry/narlington-data/Data/systems/osp-houserules/data/"
    "advanced_fantasy_players_tome_v1_3.json"
)
OUTPUT = SOURCE.parent / "spells.json"

# Inclusive pdf-page ranges for each spell-list class
CLASS_PAGE_RANGES = {
    "cleric":      (136, 145),
    "druid":       (148, 157),
    "illusionist": (160, 189),
    "magic-user":  (192, 212),
}

LEVEL_MAP = {
    "1st level spells": 1,
    "2nd level spells": 2,
    "3rd level spells": 3,
    "4th level spells": 4,
    "5th level spells": 5,
    "6th level spells": 6,
}

# Unicode en-space character used as bullet leader in the source PDF text
EN_SPACE = " "

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_id(name: str) -> str:
    """Convert a spell name to a snake_case id."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def is_blank_or_spacer(line: str) -> bool:
    """True for empty lines or en-space-only lines used as bullet spacers."""
    s = line.strip()
    return s == "" or s == EN_SPACE


def is_page_number_line(line: str) -> bool:
    return bool(re.match(r"^\d+$", line.strip()))


def is_level_header(line: str):
    """Return int level if line is a level header, else None."""
    return LEVEL_MAP.get(line.strip().lower())


def is_duration_line(line: str) -> bool:
    return line.strip().startswith("Duration:")


def is_range_line(line: str) -> bool:
    return line.strip().startswith("Range:")


def is_reversed_line(line: str) -> bool:
    return bool(re.match(r"^Reversed:", line.strip()))


def join_lines(lines: list) -> str:
    """
    Join raw text lines into clean prose:
    - strip en-space bullet markers and bullet glyphs
    - remove class-name section footers (e.g. 'Cleric Spells\nCleric Spells')
    - collapse soft-hyphenated line breaks
    - join wrapped lines into single flowing text
    """
    text = "\n".join(lines)
    # Remove en-space ( ) + optional whitespace + bullet glyph sequences
    text = re.sub(r" \s*\n?\s*▶\s*", "\n", text)
    # Any stray bullet glyphs or bare en-spaces
    text = text.replace("▶", "").replace(EN_SPACE, "")
    # Remove repeated class-name section footers e.g. "Cleric Spells\nCleric Spells"
    text = re.sub(
        r"[A-Z][A-Za-z-]+(?: [A-Z][A-Za-z-]+)* Spells\n[A-Z][A-Za-z-]+(?: [A-Z][A-Za-z-]+)* Spells\n?",
        "",
        text,
    )
    # Collapse soft-hyphenated line breaks: "at-\ntack" -> "attack"
    text = re.sub(r"-\n", "", text)
    # Join wrapped lines into single flow (single \n -> space)
    text = re.sub(r"(?<!\n)\n(?!\n)", " ", text)
    # Tidy multiple spaces
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Core parsing
# ---------------------------------------------------------------------------

def extract_pages_text(page_records, lo: int, hi: int) -> str:
    """Concatenate text from pdf pages lo..hi (inclusive)."""
    parts = []
    for rec in page_records:
        if lo <= rec["pdf_page"] <= hi:
            parts.append(rec["text"])
    return "\n".join(parts)


def parse_spells(raw_text: str) -> list:
    """
    Parse a block of raw text (from a class's page range) into a list of
    spell dicts.

    Strategy:
      Phase 1 - scan all lines for Duration: markers (each marks a spell start)
                and level headers.
                IMPORTANT: Only treat Duration: as a spell header if it is
                immediately followed (within the next few real content lines)
                by a Range: line.  This filters out prose-embedded Duration:
                lines (e.g. inside the Charm Person / Charm Monster descriptions).
      Phase 2 - for each spell block (Duration line -> next spell name line),
                parse Duration, Range, description, and optional Reversed section
                in a single pass through the lines.
    """

    lines = raw_text.splitlines()

    # -----------------------------------------------------------------------
    # Phase 1: locate spell starts and level headers
    # -----------------------------------------------------------------------
    spell_starts = []   # list of (dur_idx, name_idx), sorted by dur_idx
    level_events = {}   # line_idx -> level_int

    for i, line in enumerate(lines):
        stripped = line.strip()
        lvl = is_level_header(stripped)
        if lvl:
            level_events[i] = lvl
        elif is_duration_line(stripped) and i > 0:
            # Validate: Range: must appear within the next few real content
            # lines (skipping blanks, spacers, page-numbers, and Duration
            # continuation lines).  This rejects prose-embedded "Duration:"
            # lines inside descriptions (e.g. Charm Person / Charm Monster)
            # because those are followed by plain prose, not by Range:.
            #
            # We scan up to 4 real content lines.  If we see Range: we accept.
            # If we see any line that begins a spell-description paragraph
            # (i.e., not a Duration continuation and not Range:) we reject.
            found_range = False
            real_lines_seen = 0
            for look in range(i + 1, min(i + 10, len(lines))):
                ls = lines[look].strip()
                if is_blank_or_spacer(lines[look]) or is_page_number_line(ls):
                    continue
                if is_range_line(ls):
                    found_range = True
                    break
                # This line is real content that is not Range:.
                # If it looks like a Duration continuation (i.e., does NOT
                # start with a capital word followed by colon, bullet, or
                # a digit), keep scanning; otherwise stop.
                real_lines_seen += 1
                if real_lines_seen >= 3:
                    break  # too many continuation lines, looks like prose
            if not found_range:
                continue

            # Walk back past blank / page-number / spacer lines to find name
            j = i - 1
            while j >= 0 and (
                is_blank_or_spacer(lines[j])
                or is_page_number_line(lines[j])
            ):
                j -= 1
            if j >= 0:
                spell_starts.append((i, j))

    # Build a line_idx -> current_level map
    level_at_line = {}
    cur_lvl = 1
    for i in range(len(lines)):
        if i in level_events:
            cur_lvl = level_events[i]
        level_at_line[i] = cur_lvl

    # -----------------------------------------------------------------------
    # Phase 2: parse each spell's block
    # -----------------------------------------------------------------------
    spells = []

    for k, (dur_idx, name_idx) in enumerate(spell_starts):
        # Spell block runs from the Duration line up to (but not including)
        # the next spell's name line.
        if k + 1 < len(spell_starts):
            next_name_idx = spell_starts[k + 1][1]
            block_end = next_name_idx
        else:
            block_end = len(lines)

        name = lines[name_idx].strip()
        level = level_at_line[name_idx]

        block_lines = lines[dur_idx:block_end]

        # --- Parse fields using a simple state machine ---
        duration_val = ""
        range_val = ""
        desc_lines = []
        rev_name = None
        rev_lines = []

        state = "duration"

        for bl in block_lines:
            stripped = bl.strip()

            # Always skip page-number-only lines and bare spacer lines
            if is_page_number_line(stripped) or is_blank_or_spacer(bl):
                continue

            if state == "duration":
                if is_duration_line(stripped):
                    duration_val = stripped[len("Duration:"):].strip()
                    state = "duration_cont"
                # else: skip anything before Duration (shouldn't happen)

            elif state == "duration_cont":
                if is_range_line(stripped):
                    range_val = stripped[len("Range:"):].strip()
                    state = "desc"
                else:
                    # Continuation of a multi-line Duration value
                    duration_val += " " + stripped

            elif state == "desc":
                if is_level_header(stripped):
                    continue  # skip level headers inside description
                if is_reversed_line(stripped):
                    rev_name = stripped[len("Reversed:"):].strip()
                    state = "reversed"
                else:
                    desc_lines.append(bl)  # keep original (with bullets etc.)

            elif state == "reversed":
                if is_level_header(stripped):
                    continue
                rev_lines.append(bl)

        full_desc = join_lines(desc_lines)
        full_rev_desc = join_lines(rev_lines) if rev_lines else ""

        # Build the spell object
        spell = {
            "id": make_id(name),
            "name": name,
            "level": level,
            "duration": duration_val.strip(),
            "range": range_val.strip(),
            "description": full_desc,
        }
        if rev_name:
            spell["reversed"] = {
                "name": rev_name,
                "description": full_rev_desc,
            }

        spells.append(spell)

    return spells


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    with open(SOURCE) as f:
        data = json.load(f)

    page_records = data["page_records"]

    spell_lists = {}
    for cls, (lo, hi) in CLASS_PAGE_RANGES.items():
        raw = extract_pages_text(page_records, lo, hi)
        spells = parse_spells(raw)
        spell_lists[cls] = spells

    output = {
        "source": {
            "title": "OSP Houserules Spell Compendium",
            "basedOn": ["OSE Advanced Fantasy Player's Tome v1.3"],
            "houseRulesVersion": "1.5",
        },
        "houseRules": {
            "wildMagic": {
                "description": "When casting any spell, make a to-hit roll.",
                "natural20": "Boon: additional, powerful, or helpful result.",
                "natural1": "Bane: wild, unpredictable, or possibly harmful result.",
            },
            "spellcastingFocus": (
                "Spellcasters require a focus object (staff, wand, crystal, "
                "instrument, or holy symbol). Without it they cannot cast."
            ),
            "spellbooks": (
                "All arcane spells must be stored in a spellbook. "
                "One page per spell level."
            ),
            "bonusSpells": {
                "doesNotApplyTo": ["Bard", "Paladin", "Ranger"],
                "table": [
                    {"primeRequisite": "13-14", "level1": 1, "level2": 0, "level3": 0},
                    {"primeRequisite": "15-16", "level1": 1, "level2": 1, "level3": 0},
                    {"primeRequisite": "17-18", "level1": 1, "level2": 1, "level3": 1},
                ],
            },
        },
        "spellLists": spell_lists,
    }

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nWrote {OUTPUT}\n")

    # Summary
    print("=" * 60)
    print("SPELL COUNTS")
    print("=" * 60)
    for cls, spells in spell_lists.items():
        by_level = {}
        for s in spells:
            by_level.setdefault(s["level"], []).append(s)
        level_summary = ", ".join(
            f"L{lvl}: {len(v)}" for lvl, v in sorted(by_level.items())
        )
        print(f"  {cls:12s}  total={len(spells):3d}   [{level_summary}]")

    print()
    print("=" * 60)
    print("SAMPLE SPELL PER CLASS")
    print("=" * 60)
    for cls, spells in spell_lists.items():
        if spells:
            s = spells[0]
            print(f"\n  [{cls.upper()}]")
            print(f"    id:          {s['id']}")
            print(f"    name:        {s['name']}")
            print(f"    level:       {s['level']}")
            print(f"    duration:    {s['duration']}")
            print(f"    range:       {s['range']}")
            desc_snippet = s["description"][:120].replace("\n", " ")
            print(f"    description: {desc_snippet}...")
            if "reversed" in s:
                print(f"    reversed:    {s['reversed']['name']}")


if __name__ == "__main__":
    main()
