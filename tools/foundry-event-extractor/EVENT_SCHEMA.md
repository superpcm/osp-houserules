# Foundry Event Extractor — Output Schema

## Overview

The extractor reads Foundry VTT `messages.db` (NDJSON / NeDB format) and produces
structured story-relevant event records. Each record represents a discrete
in-game moment that matters to campaign narrative.

## Pipeline Stages

1. **Ingest** — Parse NDJSON lines into `RawMessage` objects
2. **Classify** — Label each message by Foundry type, parse embedded rolls, detect
   mechanical/narrative/banter content
3. **Filter** — Apply 17 keep/drop rules from `story-filtering-policy.md` (parent
   task t_d4ee245d). Whispers, scheduling, tech issues, jokes, and casual banter
   are dropped unless they carry game-mechanical content.
4. **Extract** — Transform kept messages into `StoryEvent` records, assigning a
   category, confidence level, and narrative summary
5. **Serialize** — Output JSON with event list, pipeline metadata, and statistics

## Output Format

```json
{
  "pipeline": "foundry-event-extractor v1.0",
  "generated_at": "2026-06-10T12:00:00Z",
  "total_events": 142,
  "by_category": {
    "COMBAT": 87,
    "CHARACTER_MOMENT": 23,
    "NPC_INTERACTION": 12,
    "DISCOVERY": 8,
    "DM_COMMENTARY": 7,
    "ITEM_ACQUIRED": 3,
    "DUNGEONEERING": 1,
    "LORE_FRAGMENT": 1
  },
  "by_confidence": {
    "FULL": 95,
    "STRONG": 40,
    "GUESS": 7
  },
  "events": [
    { "... StoryEvent ..." }
  ]
}
```

## StoryEvent Fields

| Field                 | Type              | Required | Description |
|-----------------------|-------------------|----------|-------------|
| `event_id`            | string            | yes      | Unique ID: `evt_{message_id}_{counter}` |
| `category`            | string            | yes      | One of 11 categories (see below) |
| `timestamp`           | integer           | yes      | Unix timestamp in milliseconds |
| `timestamp_human`     | string (ISO date) | yes      | Human-readable date e.g. `2022-06-18` |
| `session_hint`        | string            | yes      | Date-based session marker (YYYY-MM-DD) |
| `source_type`         | string            | yes      | Always `"foundry_chat"` for this pipeline |
| `source_message_id`   | string            | yes      | The `_id` from the original NDJSON message |
| `summary`             | string            | yes      | Concise one-line summary of the event |
| `detail`              | string            | yes      | Longer description including mechanical context |
| `confidence`          | string            | yes      | `"FULL"` \| `"STRONG"` \| `"GUESS"` |
| `reliability_note`    | string            | yes      | Explanation of the confidence level |
| `actors_involved`     | array of strings  | yes      | Speaker aliases and character names found in content |
| `mechanical_detail`   | array or null     | no       | Parsed roll data (formula, total, dice, crit/fumble flags) |
| `provenance`          | object            | yes      | Message type, filter decision, applied rule, raw snippet |

## Event Categories (11)

| Category              | Description |
|-----------------------|-------------|
| `COMBAT`              | Combat rounds, attacks, damage, initiative, critical hits/fumbles |
| `CHARACTER_MOMENT`    | Character decisions, actions, roleplay, emote descriptions |
| `DISCOVERY`           | Locations found, plot points uncovered, secrets revealed |
| `NPC_INTERACTION`     | NPC conversations, reactions, dealings, named NPC speech |
| `DUNGEONEERING`       | Dungeon/travel navigation, traps, exploration, environmental |
| `SPIRITUAL`           | Divine interventions, omens, dreams, religious moments |
| `LORE_FRAGMENT`       | World lore, history, rumors, legends revealed |
| `PLOT_TURN`           | Major story developments, quest changes, twists |
| `ITEM_ACQUIRED`       | Treasure, items, equipment gained, lost, bought, sold |
| `UNRESOLVED_THREAD`   | Cliffhangers, open questions, hooks left dangling |
| `DM_COMMENTARY`       | DM rulings, explanations, announcements (OOC from Paul) |

## Confidence Levels

| Level    | Meaning |
|----------|---------|
| `FULL`   | Verifiable from Foundry message data (dice roll values, formulas, types). The event happened exactly as recorded. |
| `STRONG` | Heuristic from Foundry chat (IC/emote text). Likely narrative content, but cross-reference with audio transcript needed for full context. |
| `GUESS`  | Best-effort from OOC or ambiguous message types. Unreliable without other sources. |

## Filter Rules Applied (17 from story-filtering-policy.md)

### Keep rules
| Rule | Trigger |
|------|---------|
| K1   | Table humor with in-game impact (OOC chat referencing game mechanics) |
| K2   | Rules discussion (OOC chat with game keywords) |
| K3   | Casually delivered game facts (IC/Emote chat) |
| K4   | All mechanical events (dice rolls, system messages) |
| K5   | Character actions/decisions (Emote/IC) |
| K6   | Discoveries (keyword match: find, discover, reveal) |
| K7   | Combat results (initiative, damage, attack rolls) |
| K8   | Roleplay moments (IC/Emote with named speaker) |
| K9   | Items, injuries, unresolved threads (keyword match) |
| K10  | Spells, saves, checks, attacks (d20/d100 rolls) |
| K11  | Critical hits/failures (natural 20 or 1 on d20) |

### Drop rules
| Rule | Trigger |
|------|---------|
| D1   | Off-topic chatter (OOC without game keywords) |
| D2   | Technical issues (mic, audio, discord keywords) |
| D3   | Unrelated jokes (joke markers, no game content) |
| D4   | Scheduling (next session, cancel keywords) |
| D5   | Casual banter (default OOC without game content) |
| D6   | Whisper messages (private player-to-player) |

## Known Limitations

1. **No transcript fusion** — Chat messages alone can't distinguish table humor
   that became in-fiction (K1) from dropped jokes (D3) without Zoom transcripts.
   Currently K1 is under-extracted; K3/D3 boundary is a best-effort heuristic.
2. **No combat round tracking** — Without `combats.db`, combat rounds are
   inferred from turn markers and initiative rolls.
3. **Session boundaries** — Sessions are approximated by date from timestamps.
   True session segmentation requires audio transcript session markers.
4. **NPC detection** — Named NPC detection relies on a static `KNOWN_CHARACTERS`
   set; new or unnamed NPCs may be miscategorised.

## Sample Event

```json
{
  "event_id": "evt_wtYDzDluoQ2ftdd3_1",
  "category": "COMBAT",
  "timestamp": 1655514993576,
  "session_hint": "2022-06-18",
  "source_type": "foundry_chat",
  "source_message_id": "07qWSw3deQWlEWw8",
  "summary": "Madoc Brookhouse rolled 1 (1d4)",
  "detail": "Formula: 1d4, Total: 1",
  "confidence": "FULL",
  "reliability_note": "Verified from Foundry message 07qWSw3deQWlEWw8",
  "actors_involved": ["Madoc Brookhouse"],
  "mechanical_detail": [
    {
      "formula": "1d4",
      "total": 1,
      "dice": "1d4",
      "is_critical": false,
      "is_fumble": false
    }
  ],
  "provenance": {
    "message_type": "dice_roll",
    "decision": "keep",
    "rule": "K4: mechanical event",
    "raw_snippet": "1"
  }
}
```