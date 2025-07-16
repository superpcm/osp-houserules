// ose.js - Main system entry point
console.log("OSP Debug: src/ose.js module loaded");

import { OspActorSheetCharacter } from "./module/actor/sheets/character-sheet.js";
import { OspActorSheetMonster } from "./module/actor/sheets/monster-sheet.js";
import { OspActor } from "./module/actor/actor.js";

Hooks.once("init", () => {
  CONFIG.Actor.documentClass = OspActor;
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("osp-houserules", OspActorSheetCharacter, {
    types: ["character"],
    makeDefault: true
  });
  foundry.documents.collections.Actors.registerSheet("osp-houserules", OspActorSheetMonster, {
    types: ["monster"],
    makeDefault: true
  });

  CONFIG.Actor.typeLabels = {
    character: "Character",
    monster: "Monster"
  };

  console.log("OSP Debug: Actor sheets registered successfully");
});
