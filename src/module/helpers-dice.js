/**
 * @file Helpful methods for dealing with OSP-specific dice logic
 */
import { OSP } from "./config";

const OspDice = {
  async sendRoll({
    parts = [],
    data = {},
    title = null,
    flavor = null,
    speaker = null,
    form = null,
    chatMessage = true,
  } = {}) {
    const template = `${OSP.systemPath()}/templates/chat/roll-result.html`;

    const chatData = {
      user: game.user.id,
      speaker,
    };

    const templateData = {
      title,
      flavor,
      data,
      config: CONFIG.OSE,
    };

    // Optionally include a situational bonus
    if (form !== null && form.bonus.value) {
      parts.push(form.bonus.value);
    }

    const roll = new Roll(parts.join("+"), data);
    await roll.evaluate();

    let rollMode = game.settings.get("core", "rollMode");
    rollMode = form ? form.rollMode.value : rollMode;

    // Force blind roll (ability formulas)
    if (!form && data.roll.blindroll) {
      rollMode = game.user.isGM ? "selfroll" : "blindroll";
    }

    if (["gmroll", "blindroll"].includes(rollMode))
      chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    if (rollMode === "selfroll") chatData.whisper = [game.user._id];
    if (rollMode === "blindroll") {
      chatData.blind = true;
      data.roll.blindroll = true;
    }

    templateData.result = OspDice.digestResult(data, roll);

    return new Promise((resolve) => {
      roll.render().then((r) => {
        templateData.rollOSE = r;
        foundry.applications.handlebars.renderTemplate(template, templateData).then((content) => {
          chatData.content = content;
          if (game.dice3d) {
            game.dice3d
              .showForRoll(roll, game.user, true, chatData.whisper, chatData.blind)
              .then(() => {
                if (chatMessage !== false) ChatMessage.create(chatData);
                resolve(roll);
              });
          } else {
            chatData.sound = CONFIG.sounds.dice;
            if (chatMessage !== false) ChatMessage.create(chatData);
            resolve(roll);
          }
        });
      });
    });
  },

  /**
   * Digesting results depending on type of roll
   */
  digestResult(data, roll) {
    const result = {
      isSuccess: false,
      isFailure: false,
      target: data.roll.target,
      total: roll.total,
    };

    const die = roll.dice?.[0]?.results?.[0]?.result ?? roll.total;

    switch (data.roll.type) {
      case "result": {
        result.isSuccess = roll.total === result.target;
        result.isFailure = !result.isSuccess;
        break;
      }
      case "above": {
        // SAVING THROWS
        result.isSuccess = roll.total >= result.target;
        result.isFailure = !result.isSuccess;
        break;
      }
      case "below": {
        // MORALE, EXPLORATION
        result.isSuccess = roll.total <= result.target;
        result.isFailure = !result.isSuccess;
        break;
      }
      case "check": {
        // SCORE CHECKS
        result.isSuccess = die === 1 || (roll.total <= result.target && die < 20);
        result.isFailure = !result.isSuccess;
        break;
      }
      case "table": {
        const { table } = data.roll;
        let output = Object.values(table)[0];
        for (let i = 0; i <= roll.total; i++) {
          if (table[i]) output = table[i];
        }
        result.details = output;
        break;
      }
      default: {
        break;
      }
    }
    return result;
  },

  /**
   * Evaluates if a roll is successful for both THAC0 and Ascending AC
   */
  attackIsSuccess(roll, thac0, ac) {
    // Natural 1
    if (roll.terms[0].results[0].result === 1) return false;
    // Natural 20
    if (roll.terms[0].results[0].result === 20) return true;
    return roll.total + ac >= thac0;
  },

  /**
   * Digest the results of a target to reach for attack rolls
   */
  digestAttackResult(data, roll) {
    const result = {
      isSuccess: false,
      isFailure: false,
      target: "",
      total: roll.total,
    };
    result.target = data.roll.thac0;
    const targetActorData = data.roll.target?.actor?.system || null;

    // OSP uses system.ac (number, AAC) and system.ac (descending) stored in armor items
    // The actor calculates system.ac as ascending AC
    const targetAc = data.roll.target ? (targetActorData?.ac ?? 9) : 9;
    const targetAac = data.roll.target ? (targetActorData?.ac ?? 10) : 10;
    result.victim = data.roll.target || null;

    if (game.settings.get(game.system.id, "ascendingAC")) {
      const attackBonus = 0;
      if (this.attackIsSuccess(roll, targetAac, attackBonus) || result.victim == null) {
        result.details = game.i18n.format("OSE.messages.AttackAscendingSuccess", { result: roll.total });
        result.isSuccess = true;
      } else {
        result.details = game.i18n.format("OSE.messages.AttackAscendingFailure", { bonus: result.target });
        result.isFailure = true;
      }
    } else if (this.attackIsSuccess(roll, result.target, targetAc) || result.victim == null) {
      const value = result.target - roll.total;
      result.details = game.i18n.format("OSE.messages.AttackSuccess", { result: value, bonus: result.target });
      result.isSuccess = true;
    } else {
      result.details = game.i18n.format("OSE.messages.AttackFailure", { bonus: result.target });
      result.isFailure = true;
    }
    return result;
  },

  async sendAttackRoll({
    parts = [],
    data = {},
    flags = {},
    title = null,
    flavor = null,
    speaker = null,
    form = null,
  } = {}) {
    if (data.roll.dmg.filter((v) => v !== "").length === 0) {
      ui.notifications.error("Attack has no damage dice terms; be sure to set the attack's damage");
      return;
    }
    const template = `${OSP.systemPath()}/templates/chat/roll-attack.html`;
    const chatData = { user: game.user.id, speaker, flags };
    const templateData = { title, flavor, data, config: CONFIG.OSE };

    if (form !== null && form.bonus.value) parts.push(form.bonus.value);

    const roll = new Roll(parts.join("+"), data);
    await roll.evaluate();
    const dmgRoll = new Roll(data.roll.dmg.join("+"), data);
    await dmgRoll.evaluate();

    let rollMode = game.settings.get("core", "rollMode");
    rollMode = form ? form.rollMode.value : rollMode;

    if (data.roll.blindroll) {
      rollMode = game.user.isGM ? "selfroll" : "blindroll";
    }

    if (["gmroll", "blindroll"].includes(rollMode))
      chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    if (rollMode === "selfroll") chatData.whisper = [game.user._id];
    if (rollMode === "blindroll") {
      chatData.blind = true;
      data.roll.blindroll = true;
    }

    templateData.result = OspDice.digestAttackResult(data, roll);

    return new Promise((resolve) => {
      roll.render().then((r) => {
        templateData.rollOSE = r;
        dmgRoll.render().then((dr) => {
          templateData.rollDamage = dr;
          foundry.applications.handlebars.renderTemplate(template, templateData).then((content) => {
            chatData.content = content;
            if (game.dice3d) {
              game.dice3d
                .showForRoll(roll, game.user, true, chatData.whisper, chatData.blind)
                .then(() => {
                  if (templateData.result.isSuccess) {
                    templateData.result.dmg = dmgRoll.total;
                    game.dice3d
                      .showForRoll(dmgRoll, game.user, true, chatData.whisper, chatData.blind)
                      .then(() => { ChatMessage.create(chatData); resolve(roll); });
                  } else {
                    ChatMessage.create(chatData);
                    resolve(roll);
                  }
                });
            } else {
              chatData.sound = CONFIG.sounds.dice;
              ChatMessage.create(chatData);
              resolve(roll);
            }
          });
        });
      });
    });
  },

  async RollSave({
    parts = [],
    data = {},
    skipDialog = false,
    speaker = null,
    flavor = null,
    title = null,
    chatMessage = true,
  } = {}) {
    let rolled = false;
    const template = `${OSP.systemPath()}/templates/chat/roll-dialog.html`;
    const dialogData = {
      formula: parts.join(" "),
      data,
      rollMode: game.settings.get("core", "rollMode"),
      rollModes: CONFIG.Dice.rollModes,
    };

    const rollData = { parts, data, title, flavor, speaker, chatMessage };
    if (skipDialog) return OspDice.sendRoll(rollData);

    let roll;
    const buttons = [
      {
        action: "ok",
        label: game.i18n.localize("OSE.Roll"),
        icon: "fas fa-dice-d20",
        callback: (event, button) => {
          rolled = true;
          rollData.form = button.form;
          roll = OspDice.sendRoll(rollData);
        },
      },
      {
        action: "magic",
        label: game.i18n.localize("OSE.saves.magic.short"),
        icon: "fas fa-magic",
        callback: (event, button) => {
          rolled = true;
          rollData.form = button.form;
          rollData.parts.push(`${rollData.data.roll.magic}`);
          rollData.title += ` ${game.i18n.localize("OSE.saves.magic.short")} (${rollData.data.roll.magic})`;
          roll = OspDice.sendRoll(rollData);
        },
      },
      {
        action: "cancel",
        icon: "fas fa-times",
        label: game.i18n.localize("OSE.Cancel"),
        callback: () => {},
      },
    ];

    const html = await foundry.applications.handlebars.renderTemplate(template, dialogData);

    return new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title },
        content: html,
        buttons,
        default: "ok",
        submit: () => { resolve(rolled ? roll : false); },
      }).render(true);
    });
  },

  async Roll({
    parts = [],
    data = {},
    skipDialog = false,
    speaker = null,
    flavor = null,
    title = null,
    chatMessage = true,
    flags = {},
  } = {}) {
    let rolled = false;
    const template = `${OSP.systemPath()}/templates/chat/roll-dialog.html`;
    const dialogData = {
      formula: parts.join(" "),
      data,
      rollMode: data.roll.blindroll ? "blindroll" : game.settings.get("core", "rollMode"),
      rollModes: CONFIG.Dice.rollModes,
    };
    const rollData = { parts, data, title, flavor, speaker, chatMessage, flags };

    if (skipDialog) {
      return ["melee", "missile", "attack"].includes(data.roll.type)
        ? OspDice.sendAttackRoll(rollData)
        : OspDice.sendRoll(rollData);
    }

    let roll;
    const buttons = [
      {
        action: "ok",
        label: game.i18n.localize("OSE.Roll"),
        icon: "fas fa-dice-d20",
        callback: (event, button) => {
          rolled = true;
          rollData.form = button.form;
          roll = ["melee", "missile", "attack"].includes(data.roll.type)
            ? OspDice.sendAttackRoll(rollData)
            : OspDice.sendRoll(rollData);
        },
        default: true,
      },
      {
        action: "cancel",
        icon: "fas fa-times",
        label: game.i18n.localize("OSE.Cancel"),
        callback: () => {},
      },
    ];

    const html = await foundry.applications.handlebars.renderTemplate(template, dialogData);

    return new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title },
        content: html,
        buttons,
        submit: () => { resolve(rolled ? roll : false); },
      }).render(true);
    });
  },
};

export default OspDice;
