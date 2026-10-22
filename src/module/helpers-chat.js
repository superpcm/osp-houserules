/**
 * @file Helper functions for OSP chat messages
 */
import { changeHealth } from './health/health-authority.js';

/** Effective BR-10 damage is authoritative; raw rolls remain evidence. */
export function getChatDamageTotal(message) {
  const flags = message?.flags?.['osp-houserules'];
  const flagged = flags?.combatDamage ? (flags.combatDamageTotal ?? (flags.manualRoll ? flags.manualDamageTotal : undefined)) : undefined;
  const total = flagged ?? message?.rolls?.[0]?.total;
  return typeof total === 'number' && Number.isFinite(total) ? Math.max(0, total) : null;
}

export function getChatDamageAmount(message, multiplier = 1) {
  const total = getChatDamageTotal(message);
  if (total == null) return null;
  let amount = Math.floor(total * multiplier);
  const cap = message?.flags?.['osp-houserules']?.nonProficiencyCap;
  if (amount > 0 && cap != null && Number.isFinite(Number(cap)) && Number(cap) > 0) amount = Math.min(amount, Number(cap));
  return amount;
}

/**
 * Adds context menu options to chat messages for applying damage/healing
 */
export const addChatMessageContextOptions = (html, options) => {
  const canApply = (li) => {
    const message = game.messages.get(li.data("messageId"));
    return getChatDamageTotal(message) != null && !message?.flags?.['osp-houserules']?.healthApplied;
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
      name: "Apply magical healing",
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
export const applyDamage = async (messageId, multiplier) => {
  const message = game.messages.get(messageId);
  if (message?.flags?.['osp-houserules']?.healthApplied) return;
  const amount = getChatDamageAmount(message, multiplier);
  if (amount == null) return;
  const applyOption = game.settings.get(game.system.id, "applyDamageOption");

  let targets = [];
  if (applyOption === "targeted") {
    targets = [...game.user.targets].map((t) => t.actor).filter(Boolean);
  } else {
    targets = canvas.tokens.controlled.map((t) => t.actor).filter(Boolean);
  }

  targets = [...new Map(targets.map((actor) => [actor.uuid ?? actor.id ?? actor, actor])).values()];

  if (targets.length === 0) {
    ui.notifications.warn(game.i18n.localize("OSE.messages.NoDamageTarget"));
    return;
  }

  for (const actor of targets) {
    const command = multiplier < 0
      ? { action: 'heal', amount: Math.abs(amount), magical: true }
      : { action: 'damage', amount };
    const actorKey = String(actor.uuid ?? actor.id ?? 'actor').replace(/[^A-Za-z0-9_-]/g, '_');
    const scale = String(Math.abs(multiplier)).replace('.', '_');
    const operationId = `health-chat-${String(messageId).replace(/[^A-Za-z0-9_-]/g, '_')}-${actorKey}-${multiplier < 0 ? 'heal' : 'damage'}-${scale}`;
    const result = await changeHealth(actor, command, operationId);
    if (!result?.success) ui.notifications?.warn(`${actor.name ?? 'Target'} health change failed: ${result?.reason ?? 'unknown reason'}`);
  }
};

/**
 * Adds a damage application button to chat roll cards
 */
export const addChatMessageButtons = (message, html, data) => {
  if (getChatDamageTotal(message) == null) return;

  const damageButton = document.createElement("button");
  damageButton.className = "apply-damage";
  damageButton.title = game.i18n.localize("OSE.messages.ApplyDamage");
  damageButton.innerHTML = '<i class="fas fa-user-minus"></i>';

  damageButton.addEventListener("click", () => {
    applyDamage(message.id, 1);
  });

  html.querySelector(".message-content")?.appendChild(damageButton);
};
