/**
 * @file Registers all OSP game settings
 */

const BANK_FONT_FAMILIES = {
  council: "Council",
  futura: "Futura",
  minionPro: "Minion Pro",
  mrsEavesSmallCaps: "Mrs Eaves Small Caps",
  deadhand: "Deadhand",
  gloryHallelujah: "Glory Hallelujah",
  handwritten: "Handwritten",
  cooperStd: "Cooper Std",
};

/** Apply the world-selected font to every Westford Bank window. */
export const applyBankFontSetting = () => {
  const selected = game.settings.get(game.system.id, "bankFont");
  const family = BANK_FONT_FAMILIES[selected] ?? BANK_FONT_FAMILIES.handwritten;
  document.documentElement.style.setProperty("--osp-bank-font", family);
  document.documentElement.dataset.ospBankFont = selected in BANK_FONT_FAMILIES ? selected : "handwritten";
};

export const registerSettings = () => {
  game.settings.register(game.system.id, "initiative", {
    name: game.i18n.localize("OSE.Setting.Initiative"),
    hint: game.i18n.localize("OSE.Setting.InitiativeHint"),
    default: "group",
    scope: "world",
    config: true,
    type: String,
    choices: {
      individual: game.i18n.localize("OSE.Setting.InitiativeIndividual"),
      group: game.i18n.localize("OSE.Setting.InitiativeGroup"),
    },
  });

  game.settings.register(game.system.id, "rerollInitiative", {
    name: game.i18n.localize("OSE.Setting.RerollInitiative"),
    hint: game.i18n.localize("OSE.Setting.RerollInitiativeHint"),
    default: "reset",
    scope: "world",
    config: true,
    type: String,
    choices: {
      keep: game.i18n.localize("OSE.Setting.RerollInitiativeKeep"),
      reset: game.i18n.localize("OSE.Setting.RerollInitiativeReset"),
      reroll: game.i18n.localize("OSE.Setting.RerollInitiativeReroll"),
    },
  });

  game.settings.register(game.system.id, "ascendingAC", {
    name: game.i18n.localize("OSE.Setting.AscendingAC"),
    hint: game.i18n.localize("OSE.Setting.AscendingACHint"),
    default: true,
    scope: "world",
    config: true,
    type: Boolean,
  });

  game.settings.register(game.system.id, "morale", {
    name: game.i18n.localize("OSE.Setting.Morale"),
    hint: game.i18n.localize("OSE.Setting.MoraleHint"),
    default: true,
    scope: "world",
    config: true,
    type: Boolean,
  });

  game.settings.register(game.system.id, "significantTreasure", {
    name: game.i18n.localize("OSE.Setting.SignificantTreasure"),
    hint: game.i18n.localize("OSE.Setting.SignificantTreasureHint"),
    default: 800,
    scope: "world",
    config: true,
    type: Number,
  });

  game.settings.register(game.system.id, "applyDamageOption", {
    name: game.i18n.localize("OSE.Setting.ApplyDamageOption"),
    hint: game.i18n.localize("OSE.Setting.ApplyDamageOptionHint"),
    default: "selected",
    scope: "world",
    config: true,
    type: String,
    choices: {
      selected: game.i18n.localize("OSE.Setting.ApplyDamageOptionSelected"),
      targeted: game.i18n.localize("OSE.Setting.ApplyDamageOptionTargeted"),
      originalTarget: game.i18n.localize("OSE.Setting.ApplyDamageOptionOriginalTarget"),
    },
  });

  game.settings.register(game.system.id, "invertedCtrlBehavior", {
    name: game.i18n.localize("OSE.Setting.InvertedCtrlBehavior"),
    hint: game.i18n.localize("OSE.Setting.InvertedCtrlBehaviorHint"),
    default: false,
    scope: "client",
    config: true,
    type: Boolean,
  });

  game.settings.register(game.system.id, "ignoreAttackBonusOnDamageRoll", {
    name: game.i18n.localize("OSE.Setting.IgnoreAttackBonusOnDamageRoll"),
    hint: game.i18n.localize("OSE.Setting.IgnoreAttackBonusOnDamageRollHint"),
    default: false,
    scope: "world",
    config: true,
    type: Boolean,
  });

  game.settings.register(game.system.id, "playerLock", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => { if (ui.dmtoolkit) ui.dmtoolkit.render(); }
  });

  game.settings.register(game.system.id, "storeLock", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => { if (ui.dmtoolkit) ui.dmtoolkit.render(); }
  });

  // ── Manual Physical Dice ───────────────────────────────────────────────────
  game.settings.register(game.system.id, "allowManualPhysicalRolls", {
    name: "Allow Manual Physical Rolls",
    hint: "Let players enter physical die results instead of rolling virtually.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(game.system.id, "gmRequireVirtualRolls", {
    name: "Require Virtual Rolls",
    hint: "When enabled, manual rolling is blocked for all users regardless of their Dice Mode preference.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(game.system.id, "diceMode", {
    name: "Dice Mode",
    hint: "Virtual uses Foundry's dice roller. Manual opens a dialog to enter physical dice results. Ask prompts on every roll.",
    scope: "client",
    config: true,
    type: String,
    default: "virtual",
    choices: {
      virtual: "Virtual Dice",
      manual: "Manual Physical Dice",
      ask: "Ask Every Time"
    }
  });

  game.settings.register(game.system.id, "autoUnpause", {
    name: "Unpause World on Startup",
    hint: "When enabled, the active GM unpauses the world after startup. Disabled by default.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(game.system.id, "bankFont", {
    name: "Westford Bank Font",
    hint: "Select the typeface used in all Westford Bank windows. These choices use the shared Foundry font library, so every player sees the same selection.",
    scope: "world",
    config: true,
    type: String,
    default: "handwritten",
    choices: {
      council: "Council",
      futura: "Futura",
      minionPro: "Minion Pro",
      mrsEavesSmallCaps: "Mrs. Eaves Small Caps",
      deadhand: "Deadhand",
      gloryHallelujah: "Glory Hallelujah",
      handwritten: "Handwritten",
      cooperStd: "Cooper Std",
    },
    onChange: applyBankFontSetting,
  });

  game.settings.register(game.system.id, "partyTreasury", {
    scope: "world",
    config: false,
    type: Object,
    default: { currency: { gold: 0, silver: 0, copper: 0 }, items: [], log: [] },
  });

  game.settings.register(game.system.id, "partyStorehouse", {
    scope: "world",
    config: false,
    type: Object,
    default: { items: [], log: [] },
  });

};
