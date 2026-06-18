import { ospRoll, buildManualChatContent } from "../../dice.js";

const critDamageFormula = (formula) =>
  formula.replace(/(\d+)d(\d+)/gi, (_, n, d) => `${parseInt(n) * 2}d${d}`);

export class OspActorSheetMonster extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "monster"],
      template: "systems/osp-houserules/templates/actors/monster-sheet.html",
      width: 460,
      height: 560,
      resizable: false,
      popOut: true,
      scrollY: [".monster-sheet-scroll"]
    });
  }

  _getHeaderButtons() {
    return super._getHeaderButtons();
  }

  async getData(options) {
    const context = await super.getData(options);
    context.system = this.actor.system;

    context.weapons = this.actor.items
      .filter(i => i.type === "weapon")
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map(i => ({
        id:      i.id,
        name:    i.name,
        img:     i.img,
        damage:  i.system.damage          ?? "",
        bonus:   i.system.bonus           ?? 0,
        attackCount: i.system.attacksPerRound ?? 1,
        melee:   i.system.melee           ?? true,
        missile: i.system.missile         ?? false
      }));

    context.abilities = this.actor.items
      .filter(i => i.type === "ability")
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map(i => ({
        id:          i.id,
        name:        i.name,
        description: i.system.description ?? ""
      }));

    context.enrichedBiography = await TextEditor.enrichHTML(
      context.system.details?.biography ?? "",
      { async: true, relativeTo: this.actor }
    );

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // ── Attack roll — available in both view and edit mode ──────────────────
    html.find(".attack-roll").on("click", async (ev) => {
      const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      const weapon = this.actor.items.get(itemId);
      if (!weapon) return;

      // Require a targeted token (T key in canvas)
      const targets = [...game.user.targets];
      if (!targets.length) {
        ui.notifications.warn("Target a token first (press T on the canvas).");
        return;
      }
      const targetToken = targets[0];
      const targetActor = targetToken.actor;
      if (!targetActor) return;

      // Resolve target AAC — characters store computed ascending AC in system.ac (plain number);
      // monsters store it in system.aac.value.
      const rawAAC    = targetActor.system.aac;
      const targetAAC = (rawAAC !== null && typeof rawAAC === "object")
        ? (rawAAC.value ?? 10)
        : (targetActor.system.ac ?? 10);

      // Attacker stats
      const bba        = this.actor.system.thac0?.bba ?? 0;
      const atkBonus   = weapon.system.bonus ?? 0;
      const totalBonus = bba + atkBonus;
      const dmgFormula = weapon.system.damage || "1d6";

      // Capture names for the async closure (sheet may close before damage fires)
      const attackerName = this.actor.name;
      const weaponName   = weapon.name;
      const targetName   = targetToken.name;

      // ── To-hit rolls (one per attacksPerRound) ────────────────────────────
      const times      = weapon.system.attacksPerRound ?? 1;
      const needRoll   = targetAAC - totalBonus;
      const fullDmgFormula = atkBonus !== 0 ? `${dmgFormula} + ${atkBonus}` : dmgFormula;

      const bonusStr = totalBonus > 0 ? ` + ${totalBonus}` : totalBonus < 0 ? ` - ${Math.abs(totalBonus)}` : "";
      const speaker  = ChatMessage.getSpeaker({ actor: this.actor });
      const hitResults = [];

      for (let i = 0; i < times; i++) {
        const attackLabel = times > 1 ? ` [${i + 1}/${times}]` : "";
        const atkResult = await ospRoll("1d20", { label: `${weaponName}${attackLabel} Attack` });
        if (atkResult.cancelled) continue;

        const natural   = atkResult.total;  // "1d20" has no modifier, so total === natural die
        const rollTotal = natural + totalBonus;
        const isCrit    = natural === 20;
        const isFumble  = natural === 1;
        const isHit     = isCrit || (!isFumble && rollTotal >= targetAAC);
        if (isHit) hitResults.push({ isCrit });

        const attackResult = isCrit ? "critical_hit" : isFumble ? "critical-miss" : isHit ? "hit" : "miss";
        const hitColour    = isHit ? "#006600" : "#990000";
        const hitLabel2    = isHit ? "HIT" : "MISS";
        const totalStr     = totalBonus !== 0 ? `${natural}${bonusStr} = <strong>${rollTotal}</strong>` : `<strong>${rollTotal}</strong>`;
        const atkFlavor    = `<strong>${attackerName}</strong> → <em>${weaponName}</em>${attackLabel} vs <strong>${targetName}</strong>
                   (AAC&nbsp;${targetAAC}, need&nbsp;${needRoll}+) —
                   ${totalStr} —
                   <strong style="color:${hitColour}">${hitLabel2}</strong>`;
        const atkFlags     = { "osp-houserules": { attackResult, manualRoll: atkResult.manual } };

        if (atkResult.foundryRoll) {
          await atkResult.foundryRoll.toMessage({ speaker, flavor: atkFlavor, flags: atkFlags });
        } else {
          const whisperData = ChatMessage.applyRollMode({}, game.settings.get('core', 'rollMode'));
          await ChatMessage.create({ ...whisperData, speaker, flavor: atkFlavor, content: buildManualChatContent(atkResult, { formula: "1d20", label: `${weaponName} Attack` }), flags: atkFlags });
        }
      }

      if (!hitResults.length) return;

      // ── Damage rolls for each hit, 3 s later ──────────────────────────────
      // HP path resolved once; subsequent reads use the live actor data which
      // Foundry updates after each await actor.update().
      const hpObj   = targetActor.system.hp;
      const isHPObj = hpObj !== null && typeof hpObj === "object";
      const hpPath  = isHPObj ? "system.hp.value" : "system.hitpoints";

      setTimeout(async () => {
        try {
          for (const [h, { isCrit }] of hitResults.entries()) {
            const formula    = isCrit ? critDamageFormula(fullDmgFormula) : fullDmgFormula;
            const hitLabel   = hitResults.length > 1 ? ` [hit ${h + 1}/${hitResults.length}]` : "";
            const critSuffix = isCrit ? " (Critical Hit!)" : "";
            const dmgResult  = await ospRoll(formula, { label: `${weaponName}${hitLabel}${critSuffix} Damage` });
            if (dmgResult.cancelled) continue;

            const dmg = Math.max(1, dmgResult.total);

            const currentHP = isHPObj
              ? (targetActor.system.hp?.value ?? 0)
              : (targetActor.system.hitpoints ?? 0);
            const newHP = Math.max(0, currentHP - dmg);
            await targetActor.update({ [hpPath]: newHP });

            const dmgFlavor  = `<em>${weaponName}</em>${hitLabel}${isCrit ? " <em>(Critical Hit!)</em>" : ""} → <strong>${targetName}</strong>: <strong>${dmg}</strong> damage — HP: ${currentHP} → ${newHP}`;
            const dmgFlags   = { "osp-houserules": { combatDamage: true, manualRoll: dmgResult.manual, manualDamageTotal: dmgResult.manual ? dmgResult.total : undefined } };

            if (dmgResult.foundryRoll) {
              await dmgResult.foundryRoll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: undefined }),
                flavor: dmgFlavor,
                flags: dmgFlags
              });
            } else {
              const whisperData = ChatMessage.applyRollMode({}, game.settings.get('core', 'rollMode'));
              await ChatMessage.create({ ...whisperData, speaker: ChatMessage.getSpeaker({ actor: undefined }), flavor: dmgFlavor, content: buildManualChatContent(dmgResult, { formula, label: `${weaponName} Damage` }), flags: dmgFlags });
            }
          }
        } catch (err) {
          console.error("[OSP] Damage roll error:", err);
        }
      }, 3000);
    });

    if (!this.isEditable) return;

    html.find(".item-name, .ability-name").on("click", (ev) => {
      const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      this.actor.items.get(itemId)?.sheet?.render(true);
    });

    html.find(".item-delete").on("click", async (ev) => {
      const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      await this.actor.items.get(itemId)?.delete();
    });
  }
}
