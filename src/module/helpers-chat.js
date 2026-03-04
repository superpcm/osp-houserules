/**
 * @file Helper functions for OSP chat messages
 */

/**
 * Adds context menu options to chat messages for applying damage/healing
 */
export const addChatMessageContextOptions = (html, options) => {
  const canApply = (li) => {
    const message = game.messages.get(li.data("messageId"));
    return message?.isRoll && message?.rolls?.length > 0;
  };

  options.push(
    {
      name: game.i18n.localize("OSE.messages.ApplyDamage"),
      icon: '<i class="fas fa-user-minus"></i>',
      condition: canApply,
      callback: (li) => applyDamage(li.data("messageId"), 1),
    },
    {
      name: game.i18n.localize("OSE.messages.ApplyDamageDouble"),
      icon: '<i class="fas fa-user-minus"></i>',
      condition: canApply,
      callback: (li) => applyDamage(li.data("messageId"), 2),
    },
    {
      name: game.i18n.localize("OSE.messages.ApplyDamageHalf"),
      icon: '<i class="fas fa-user-minus"></i>',
      condition: canApply,
      callback: (li) => applyDamage(li.data("messageId"), 0.5),
    },
    {
      name: game.i18n.localize("OSE.messages.ApplyHealing"),
      icon: '<i class="fas fa-user-plus"></i>',
      condition: canApply,
      callback: (li) => applyDamage(li.data("messageId"), -1),
    }
  );
  return options;
};

/**
 * Apply damage or healing to selected/targeted tokens
 * @param {string} messageId - The ID of the chat message containing the roll
 * @param {number} multiplier - Damage multiplier (1=normal, 2=double, 0.5=half, -1=healing)
 */
const applyDamage = async (messageId, multiplier) => {
  const message = game.messages.get(messageId);
  const roll = message?.rolls?.[0];
  if (!roll) return;

  const amount = Math.floor(roll.total * multiplier);
  const applyOption = game.settings.get(game.system.id, "applyDamageOption");

  let targets = [];
  if (applyOption === "targeted") {
    targets = [...game.user.targets].map((t) => t.actor).filter(Boolean);
  } else {
    targets = canvas.tokens.controlled.map((t) => t.actor).filter(Boolean);
  }

  if (targets.length === 0) {
    ui.notifications.warn(game.i18n.localize("OSE.messages.NoDamageTarget"));
    return;
  }

  for (const actor of targets) {
    const hp = actor.system.hitpoints ?? 0;
    const maxHp = actor.system.maxhitpoints ?? hp;
    const newHp = Math.min(Math.max(hp - amount, 0), maxHp);
    await actor.update({ "system.hitpoints": newHp });
  }
};

/**
 * Adds a damage application button to chat roll cards
 */
export const addChatMessageButtons = (message, html, data) => {
  if (!message.isRoll || !message.rolls?.length) return;

  const damageButton = document.createElement("button");
  damageButton.className = "apply-damage";
  damageButton.title = game.i18n.localize("OSE.messages.ApplyDamage");
  damageButton.innerHTML = '<i class="fas fa-user-minus"></i>';

  damageButton.addEventListener("click", () => {
    applyDamage(message.id, 1);
  });

  html.querySelector(".message-content")?.appendChild(damageButton);
};
