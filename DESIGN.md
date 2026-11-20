---
name: OSP Store Ledger
description: Parchment Ledger components for GM merchants and character shopping
colors:
  primary: "#671f1c"
  ink: "#302315"
  muted-ink: "#665039"
  paper: "#ead8ae"
  brass: "#c29a53"
  rule: "#a0834c"
  walnut: "#302015"
  button-text: "#fff0cf"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "35px"
    fontWeight: 700
    lineHeight: 1.06
  headline:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  control: "3px"
  button: "4px"
  frame: "5px"
spacing:
  compact: "8px"
  panel: "16px"
  sidebar: "18px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.button-text}"
    rounded: "{rounded.button}"
    padding: "8px 15px"
  button-secondary:
    backgroundColor: "rgba(255, 246, 215, .4)"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 15px"
---

# OSP Store Ledger

## Overview

**Creative North Star: "Parchment Ledger"**

The user selected concept 1 for both the store and creator. The implementation pairs a walnut identity bar with readable ruled parchment, existing equipment artwork, brass framing, and burgundy actions. This document records the store family only; the established character, Bank, and Storehouse styling remains authoritative for their own surfaces.

**Key Characteristics:**
- Horizontal equipment rows.
- Persistent cart totals and primary action.
- Clear editable prices, stock, and party access.

## Colors

Burgundy identifies the main actions and selected category. Walnut anchors the header; paper and brass provide the ledger's material character. The existing parchment raster sits under a pale overlay so its grain does not compete with text.

## Typography

Georgia is the installed readable serif used by the actual store implementation. The heading scales down at compact window widths; prices and quantities use tabular numerals. Store styles explicitly override the system's handwritten family without changing other application families. Font Awesome retains its own icon font.

## Layout

Default application size is 1240 × 800, resizable with a 680px minimum width. The shopping cart has a minimum 440px column at full width, with separate full-width quantity and destination controls. Creator settings remain in an independent scrolling column. Catalog and cart contents scroll independently, keeping Save and Review Purchase visible. At a 920px container breakpoint, the toolbar stacks, type sizes reduce, and stock controls wrap. At 760px the shopping panels stack. These are resizable desktop windows; no mobile layout is claimed.

## Elevation & Depth

The double-line brass frame and ruled separators define structure. Primary buttons have a restrained inset highlight and small downward shadow. Panels use slight paper tint differences rather than floating cards.

## Shapes

Controls and buttons have gently curved corners. Item lists stay flat with thin horizontal rules. The compass mark is the recurring identity detail.

## Components

Primary buttons use burgundy with pale text. Secondary buttons and stock fields use paper tones. Focus rings are burgundy, and disabled controls remain visible at reduced opacity. Search, category filters, quantity steppers, product visibility controls, and destination selectors are native interactive elements with accessible names. Store and cart availability messages appear near their affected controls.

## Do's and Don'ts

- Do keep the running total and purchase action visible while cart contents scroll.
- Do reuse the campaign's real Item artwork and prices.
- Do preserve the selected Parchment Ledger direction on future store screens.
- Don't replace the ruled inventory with Merchant Shelves or a product-card grid.
- Don't add shopping decorations that reduce room for products or controls.

## Store expansion

Equipment-type filters share the ruled catalog treatment. Randomization tools use a settings column and a separate inventory preview, with explicit Apply to Draft and Save Store steps. Persistent merchant profiles control ongoing stock on in-game-day intervals; manual products remain independent. The merchant portrait/name lives in the store header, separate from the store image. An optional Sell Equipment ledger provides a drop zone, accessible item selector, offer review, and receipt. All rules remain scoped to the store application; the character-sheet baseline is unchanged.

## Weighted profile controls

Five primary fields establish merchant character: specialty, settlement, size, economy, and wealth. Restocking stays alongside those fields. Optional trading conditions, guardrails, buying-rate overrides, and a searchable compact item-rules table live under a native Advanced Settings disclosure. The disclosure and search retain their state while previews update. The independently scrolling preview shows the combined draft, so preserved manual inventory is visible before applying changes. All additions retain the existing parchment, serif type, brass rules, and burgundy actions within the store scope.
