/**
 * @file Registers all OSP game settings
 */

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
};
