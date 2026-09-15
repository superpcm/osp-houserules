# OSP-Houserules vs OSE-Foundry-Core: Gap Analysis

> **Reference:** `ose-foundry-core` = https://github.com/NecroticGnome/ose-foundry-core
> **Your module:** `osp-houserules` = `/home/superpcm/foundry/narlington-data/Data/systems/osp-houserules`
> **Date generated:** 2026-03-03

---

## Summary

`osp-houserules` has a solid character sheet, custom item types, and working actor/item plumbing. What it is missing falls into roughly eight major areas: **combat**, **party**, **dialogs**, **helpers**, **data models**, **templates/partials**, **settings**, and **chat roll templates**.

---

## 1. COMBAT SYSTEM — Completely Missing

`ose-foundry-core` has a full combat module. `osp-houserules` has none.

| What's needed | Source file in ose-foundry-core |
|---|---|
| Main combat logic (initiative, turn order) | `src/module/combat/combat.ts` |
| Combat tracker UI override | `src/module/combat/combat-tracker.ts` |
| Group initiative management | `src/module/combat/combat-set-groups.ts` |
| Individual combatant handling | `src/module/combat/combatant.ts` |
| Combat group dialog template | `templates/apps/combat-set-groups.hbs` |
| Combat tracker sidebar template | `templates/sidebar/combat-tracker-combatant.hbs` |

**Impact:** Without this, Foundry's generic combat tracker is used. No OSE-style group initiative, no custom turn ordering.

---

## 2. PARTY SYSTEM — Completely Missing

| What's needed | Source file in ose-foundry-core |
|---|---|
| Party actor management | `src/module/party/party.js` |
| Party sheet UI | `src/module/party/party-sheet.js` |
| Party XP distribution | `src/module/party/party-xp.js` |
| Party helper functions | `src/module/helpers-party.js` |
| Party sheet template | `templates/apps/party-sheet.html` |
| Party XP template | `templates/apps/party-xp.html` |

**Impact:** No group XP tracking, no party overview sheet.

---

## 3. DIALOG SYSTEM — Mostly Missing

`osp-houserules` has `item-card-dialog.js` (your custom addition). What it lacks:

| What's needed | Source file in ose-foundry-core |
|---|---|
| Character creation stat rolling dialog | `src/module/dialog/character-creation.js` |
| GP/equipment cost calculator | `src/module/dialog/character-gp-cost.js` |
| Attack/save modifier management | `src/module/dialog/character-modifiers.js` |
| Entity tweaks/adjustments | `src/module/dialog/entity-tweaks.js` |
| Character creation HTML template | `templates/actors/dialogs/character-creation.html` |
| GP cost dialog template | `templates/actors/dialogs/gp-cost-dialog.html` |
| Language creation dialog | `templates/actors/dialogs/lang-create.html` |
| Modifier management template | `templates/actors/dialogs/modifiers-dialog.html` |
| Monster saves dialog | `templates/actors/dialogs/monster-saves.html` |
| Tweaks dialog template | `templates/actors/dialogs/tweaks-dialog.html` |

---

## 4. HELPER MODULES — Mostly Missing

`osp-houserules` has Handlebars helpers embedded inline in `ose.js`. `ose-foundry-core` separates these properly:

| What's needed | Source file in ose-foundry-core | Notes |
|---|---|---|
| Behavior helpers | `src/module/behaviourHelpers.js` + `helpers-behaviour.js` | Tag, slow, brace, etc. |
| Chat message helpers | `src/module/helpers-chat.ts` | Formatted chat card logic |
| Dice roll helpers | `src/module/helpers-dice.js` | OSE dice mechanics |
| Handlebars helpers | `src/module/helpers-handlebars.ts` | Separated from main entry |
| Macro helpers | `src/module/helpers-macros.js` | Properly modular macros |
| Treasure helpers | `src/module/helpers-treasure.js` | Treasure distribution/rolling |
| Tag system | `src/module/helpers-tags.ts` | Weapon/item tags |
| Module API exposure | `src/module/fvttModuleAPIs.js` | Inter-module API hooks |
| Template preloading | `src/module/preloadTemplates.ts` | Pre-registers all Handlebars partials |
| List rendering utility | `src/module/renderList.js` | Reusable list rendering |
| Dynamic ring system | `src/module/rings.ts` | Token ring visuals |

**Key gap:** `preloadTemplates.ts` is important — without it, partials (see §6) won't work.

---

## 5. DATA MODEL CLASSES — Missing

`osp-houserules` defines data structure only in `template.json`. `ose-foundry-core` also has JS/TS data model classes that add computed fields, validation, and migration logic:

| What's needed | Source file in ose-foundry-core |
|---|---|
| Character data model | `src/module/actor/data-model-character.js` |
| Monster data model | `src/module/actor/data-model-monster.js` |
| Ability item model | `src/module/item/data-model-ability.js` |
| Armor item model | `src/module/item/data-model-armor.js` |
| Container item model | `src/module/item/data-model-container.js` |
| Base item model | `src/module/item/data-model-item.js` |
| Spell item model | `src/module/item/data-model-spell.js` |
| Weapon item model | `src/module/item/data-model-weapon.js` |

---

## 6. TEMPLATE PARTIALS — Missing

`osp-houserules` uses monolithic sheet templates. `ose-foundry-core` breaks sheets into reusable partials (requires `preloadTemplates.ts`):

| What's needed | Template file in ose-foundry-core |
|---|---|
| Item summary row | `templates/actors/partials/actor-item-summary.html` |
| Abilities tab | `templates/actors/partials/character-abilities-tab.html` |
| Attributes tab | `templates/actors/partials/character-attributes-tab.html` |
| Encumbrance component | `templates/actors/partials/character-encumbrance.html` |
| Character header | `templates/actors/partials/character-header.html` |
| Inventory tab | `templates/actors/partials/character-inventory-tab.html` |
| Notes tab | `templates/actors/partials/character-notes-tab.html` |
| Spells tab | `templates/actors/partials/character-spells-tab.html` |
| Auto-tags partial | `templates/actors/partials/item-auto-tags-partial.html` |
| Monster attributes tab | `templates/actors/partials/monster-attributes-tab.html` |
| Monster header | `templates/actors/partials/monster-header.html` |

---

## 7. CHAT/ROLL TEMPLATES — Missing

`osp-houserules` has its custom item-card system. Missing standard OSE roll formatting:

| What's needed | Template file in ose-foundry-core |
|---|---|
| Formatted attack roll | `templates/chat/roll-attack.html` |
| Character creation rolls | `templates/chat/roll-creation.html` |
| Roll dialog (before rolling) | `templates/chat/roll-dialog.html` |
| Individual initiative roll | `templates/chat/roll-individual-initiative.html` |
| Generic roll result | `templates/chat/roll-result.html` |
| Treasure roll result | `templates/chat/roll-treasure.html` |
| Inventory list in chat | `templates/chat/inventory-list.html` |
| License info card | `templates/chat/license.html` |

---

## 8. ITEM TYPES — Differences

### Missing from `osp-houserules`:
| Item type | Purpose |
|---|---|
| `ability` | Character class abilities (e.g. thief skills, turn undead) |
| `spell` | Spell items with level, memorization, etc. |

### In `osp-houserules` but NOT in `ose-foundry-core` (your custom additions):
| Item type | Purpose |
|---|---|
| `coin` | Currency tracking |
| `clothing` | Wearable clothing items |
| `ammunition` | Ammo tracking for ranged weapons |
| `livestock` | Animals |

**Missing item sheet templates:**
- `templates/items/ability-sheet.html`
- `templates/items/spell-sheet.html`
- `templates/items/entity-create.html` (generic creation UI)

---

## 9. GAME SETTINGS — Missing

`osp-houserules` has no settings registration. `ose-foundry-core` has:

| What's needed | Source file |
|---|---|
| Game settings registration | `src/module/settings.ts` |

This handles user-configurable options like initiative type, encumbrance variant, etc.

---

## 10. TOKEN RULER — Missing

| What's needed | Source file |
|---|---|
| Custom movement measurement | `src/module/actor/token-ruler.js` |

Used for OSE movement rate calculations on the canvas.

---

## 11. SCSS/STYLING — Partial

`osp-houserules` has working styles but a different organization. `ose-foundry-core` separates by concern:

| ose-foundry-core file | Your equivalent | Notes |
|---|---|---|
| `actor-base.scss` | Scattered in `character-sheet-main.scss` | Base actor styles |
| `apps.scss` | Missing | Dialog/app styles |
| `character.scss` | `character-sheet-main.scss` | Exists but monolithic |
| `core.scss` | `ose.scss` | Main entry |
| `fonts.scss` | Missing | Font definitions |
| `item.scss` | `gear.scss` | Item styles |
| `monster.scss` | Part of character-sheet-main | Monster-specific styles |
| `tables.scss` | Missing | Table formatting |
| `variables.scss` | Missing | SCSS variables/tokens |

---

## 12. BUILD & DEV TOOLING — Missing

| What's needed | File/tool in ose-foundry-core |
|---|---|
| Linting rules | `.eslintrc` |
| Code formatting | `.prettierrc` + `.prettierignore` |
| Release automation | `.github/workflows/release.yml` |
| Pre-release CI | `.github/workflows/pre-release.yml` |
| Dev container | `.devcontainer/` |
| Translation management | `crowdin.yml` |
| Dev symlink utility | `tools/symlink.js` |
| Changelog | `CHANGELOG.md` |
| Contributing guide | `CONTRIBUTING.md` |

---

## 13. TESTING — Missing

| What's needed | Location in ose-foundry-core |
|---|---|
| Actor unit tests | `src/module/actor/__tests__/` |
| Item unit tests | `src/module/item/__tests__/` |
| Combat unit tests | `src/module/combat/__tests__/` |
| Dialog unit tests | `src/module/dialog/__tests__/` |
| Party unit tests | `src/module/party/__tests__/` |
| End-to-end tests | `src/e2e/` |
| Test utilities | `src/e2e/testUtils.ts` |

---

## 14. LOCALIZATION — Partial

`osp-houserules` has English only. You likely only need English for a personal/group module, but note the gap:

- `ose-foundry-core`: 12 languages (en, de, es, fr, it, ko, pl, pt-BR, ru, sv, zh-CN, ca)
- `osp-houserules`: English (`lang/en.json`) only

---

## Priority Recommendations

If your goal is a functional house-rules system for your group, here's a suggested priority order:

### High Priority (core gameplay)
1. **Combat system** (§1) — without it, OSE initiative doesn't work correctly
2. **Game settings** (§9) — needed to configure system behavior
3. **Template preloading** (from §4) — needed before adding any partials
4. **Ability & Spell item types** (§8) — magic-users need spells

### Medium Priority (quality of life)
5. **Dialogs** (§3) — character creation, modifier rolls
6. **Data model classes** (§5) — adds validation and computed fields
7. **Chat roll templates** (§7) — nicer roll output
8. **Template partials** (§6) — cleaner, more maintainable templates

### Lower Priority (nice to have)
9. **Party system** (§2) — useful if you track XP as a group
10. **Token ruler** (§10) — canvas movement measurement
11. **Build tooling** (§12) — if you plan to publish/release
12. **Testing** (§13) — if you want automated regression coverage
