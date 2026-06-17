export class OspActorSheetMonster extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "monster"],
      template: "systems/osp-houserules/templates/actors/monster-sheet.html",
      width: 720,
      height: 560,
      resizable: true,
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
      let hitCount   = 0;

      for (let i = 0; i < times; i++) {
        const atkRoll   = new Roll("1d20");
        await atkRoll.evaluate();
        const rollTotal = atkRoll.total + totalBonus;
        const isHit     = rollTotal >= targetAAC;
        if (isHit) hitCount++;

        const attackLabel = times > 1 ? ` [${i + 1}/${times}]` : "";
        const totalStr    = totalBonus !== 0 ? `${atkRoll.total}${bonusStr} = <strong>${rollTotal}</strong>` : `<strong>${rollTotal}</strong>`;

        await atkRoll.toMessage({
          speaker,
          flavor: `<strong>${attackerName}</strong> → <em>${weaponName}</em>${attackLabel} vs <strong>${targetName}</strong>
                   (AAC&nbsp;${targetAAC}, need&nbsp;${needRoll}+) —
                   ${totalStr} —
                   <strong style="color:${isHit ? "#006600" : "#990000"}">${isHit ? "HIT" : "MISS"}</strong>`
        });
      }

      if (hitCount === 0) return;

      // ── Damage rolls for each hit, 3 s later ──────────────────────────────
      // HP path resolved once; subsequent reads use the live actor data which
      // Foundry updates after each await actor.update().
      const hpObj   = targetActor.system.hp;
      const isHPObj = hpObj !== null && typeof hpObj === "object";
      const hpPath  = isHPObj ? "system.hp.value" : "system.hitpoints";

      setTimeout(async () => {
        try {
          for (let h = 0; h < hitCount; h++) {
            const dmgRoll = new Roll(fullDmgFormula);
            await dmgRoll.evaluate();
            const dmg = Math.max(1, dmgRoll.total);

            const currentHP = isHPObj
              ? (targetActor.system.hp?.value ?? 0)
              : (targetActor.system.hitpoints ?? 0);
            const newHP = Math.max(0, currentHP - dmg);
            await targetActor.update({ [hpPath]: newHP });

            const hitLabel = hitCount > 1 ? ` [hit ${h + 1}/${hitCount}]` : "";
            await dmgRoll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: undefined }),
              flavor: `<em>${weaponName}</em>${hitLabel} → <strong>${targetName}</strong>:
                       <strong>${dmg}</strong> damage — HP: ${currentHP} → ${newHP}`
            });
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
