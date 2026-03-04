/**
 * @file System-wide configuration settings. Reachable at CONFIG.OSE (set during init).
 */

// Foundry VTT globals — not available at compile time, declared here for TS
declare const game: any;
declare const CONFIG: any;

export type OspConfig = typeof OSP;

export const OSP = {
  /** Root path for OSP system */
  get systemRoot(): string {
    return `/systems/${game.system.id}`;
  },
  /** Path for system templates — templates live at root, not in dist */
  systemPath(): string {
    return this.systemRoot;
  },
  /** Path for system assets */
  get assetsPath(): string {
    return `${this.systemRoot}/assets`;
  },

  scores: {
    str: "OSE.scores.str.long",
    int: "OSE.scores.int.long",
    dex: "OSE.scores.dex.long",
    wis: "OSE.scores.wis.long",
    con: "OSE.scores.con.long",
    cha: "OSE.scores.cha.long",
  },
  scores_short: {
    str: "OSE.scores.str.short",
    int: "OSE.scores.int.short",
    dex: "OSE.scores.dex.short",
    wis: "OSE.scores.wis.short",
    con: "OSE.scores.con.short",
    cha: "OSE.scores.cha.short",
  },
  roll_type: {
    result: "=",
    above: "≥",
    below: "≤",
  },
  saves_short: {
    death: "OSE.saves.death.short",
    wand: "OSE.saves.wand.short",
    paralysis: "OSE.saves.paralysis.short",
    breath: "OSE.saves.breath.short",
    spell: "OSE.saves.spell.short",
  },
  saves_long: {
    death: "OSE.saves.death.long",
    wand: "OSE.saves.wand.long",
    paralysis: "OSE.saves.paralysis.long",
    breath: "OSE.saves.breath.long",
    spell: "OSE.saves.spell.long",
  },
  armor: {
    unarmored: "OSE.armor.unarmored",
    light: "OSE.armor.light",
    heavy: "OSE.armor.heavy",
    shield: "OSE.armor.shield",
  },
  apply_damage_options: {
    selected: "selected",
    targeted: "targeted",
    originalTarget: "originalTarget",
  },
  colors: {
    green: "OSE.colors.green",
    red: "OSE.colors.red",
    yellow: "OSE.colors.yellow",
    purple: "OSE.colors.purple",
    blue: "OSE.colors.blue",
    orange: "OSE.colors.orange",
    white: "OSE.colors.white",
  },
  tags: {
    melee: "OSE.items.Melee",
    missile: "OSE.items.Missile",
    slow: "OSE.items.Slow",
    twohanded: "OSE.items.TwoHanded",
    blunt: "OSE.items.Blunt",
    brace: "OSE.items.Brace",
    splash: "OSE.items.Splash",
    reload: "OSE.items.Reload",
    charge: "OSE.items.Charge",
  },
  auto_tags: {
    get melee() {
      return {
        label: CONFIG.OSE.tags.melee,
        image: `${CONFIG.OSE.assetsPath}/melee.png`,
        icon: "fa-sword",
      };
    },
    get missile() {
      return {
        label: CONFIG.OSE.tags.missile,
        image: `${CONFIG.OSE.assetsPath}/missile.png`,
        icon: "fa-bow-arrow",
      };
    },
    get slow() {
      return {
        label: CONFIG.OSE.tags.slow,
        image: `${CONFIG.OSE.assetsPath}/slow.png`,
        icon: "fa-weight-hanging",
      };
    },
    get twohanded() {
      return {
        label: CONFIG.OSE.tags.twohanded,
        image: `${CONFIG.OSE.assetsPath}/twohanded.png`,
        icon: "fa-hands-holding",
      };
    },
    get blunt() {
      return {
        label: CONFIG.OSE.tags.blunt,
        image: `${CONFIG.OSE.assetsPath}/blunt.png`,
        icon: "fa-hammer-crash",
      };
    },
    get brace() {
      return {
        label: CONFIG.OSE.tags.brace,
        image: `${CONFIG.OSE.assetsPath}/brace.png`,
        icon: "fa-block-brick",
      };
    },
    get splash() {
      return {
        label: CONFIG.OSE.tags.splash,
        image: `${CONFIG.OSE.assetsPath}/splash.png`,
        icon: "fa-burst",
      };
    },
    get reload() {
      return {
        label: CONFIG.OSE.tags.reload,
        image: `${CONFIG.OSE.assetsPath}/reload.png`,
        icon: "fa-gear",
      };
    },
    get charge() {
      return {
        label: CONFIG.OSE.tags.charge,
        image: `${CONFIG.OSE.assetsPath}/charge.png`,
        icon: "fa-person-running",
      };
    },
  },
  tag_images: {
    get melee() { return `${CONFIG.OSE.assetsPath}/melee.png`; },
    get missile() { return `fa-bow-arrow`; },
    get slow() { return `${CONFIG.OSE.assetsPath}/slow.png`; },
    get twohanded() { return `${CONFIG.OSE.assetsPath}/twohanded.png`; },
    get blunt() { return `${CONFIG.OSE.assetsPath}/blunt.png`; },
    get brace() { return `${CONFIG.OSE.assetsPath}/brace.png`; },
    get splash() { return `${CONFIG.OSE.assetsPath}/splash.png`; },
    get reload() { return `${CONFIG.OSE.assetsPath}/reload.png`; },
    get charge() { return `${CONFIG.OSE.assetsPath}/charge.png`; },
  },
  monster_saves: {
    0:  { d: 14, w: 15, p: 16, b: 17, s: 18 },
    1:  { d: 12, w: 13, p: 14, b: 15, s: 16 },
    4:  { d: 10, w: 11, p: 12, b: 13, s: 14 },
    7:  { d:  8, w:  9, p: 10, b: 10, s: 12 },
    10: { d:  6, w:  7, p:  8, b:  8, s: 10 },
    13: { d:  4, w:  5, p:  6, b:  5, s:  8 },
    16: { d:  2, w:  3, p:  4, b:  3, s:  6 },
    19: { d:  2, w:  2, p:  2, b:  2, s:  4 },
    22: { d:  2, w:  2, p:  2, b:  2, s:  2 },
  },
  monster_thac0: {
    0: 20, 1: 19, 2: 18, 3: 17, 4: 16, 5: 15,
    6: 14, 7: 13, 9: 12, 10: 11, 12: 10, 14: 9,
    16: 8, 18: 7, 20: 6, 22: 5,
  },
};

export default OSP;
