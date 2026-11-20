import { beforeEach, describe, expect, it, vi } from "vitest";

const roll = vi.hoisted(() => vi.fn());
vi.mock("../dice.js", () => ({ ospRoll: roll }));

const sid = "osp-houserules";
let handlers;

beforeEach(() => {
  vi.resetModules();
  roll.mockResolvedValue({ cancelled: false, total: 7 });
  handlers = new Map();
  vi.stubGlobal("Hooks", { on: vi.fn((name, fn) => handlers.set(name, fn)) });
  vi.stubGlobal("Dialog", class { render() {} });
  vi.stubGlobal("game", {
    system: { id: sid },
    user: { isGM: true },
    settings: { get: vi.fn(() => true) },
    combat: null
  });
  vi.stubGlobal("CONST", { TOKEN_DISPOSITIONS: { HOSTILE: -1 } });
  vi.stubGlobal("foundry", {
    utils: {
      expandObject: value => value,
      getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object)
    }
  });
});

function combatFixture(id = "combat") {
  const actor = { id: "actor", system: { hp: { value: 10 }, details: { morale: 7 } } };
  const combatant = { id: "combatant", tokenId: "token", actor, token: { disposition: -1 } };
  const survivor = { id: "survivor", tokenId: "survivor-token", actor: { id: "survivor-actor", system: { hp: { value: 10 }, details: { morale: 7 } } }, token: { disposition: -1 } };
  const combat = { id, started: true, combatants: [combatant, survivor] };
  game.combat = combat;
  return { actor, combatant, combat };
}

describe("morale setting", () => {
  it("skips token and actor casualty processing while disabled", async () => {
    const { actor } = combatFixture();
    game.settings.get.mockReturnValue(false);
    const { registerMoraleHooks } = await import("./morale.js");
    registerMoraleHooks();

    await handlers.get("updateToken")({ id: "token" }, { delta: { system: { hp: { value: 0 } } } });
    await handlers.get("updateActor")(actor, { system: { hp: { value: 0 } } });

    expect(roll).not.toHaveBeenCalled();
  });

  it("runs checks through both casualty hooks while enabled", async () => {
    const { actor } = combatFixture();
    const { registerMoraleHooks } = await import("./morale.js");
    registerMoraleHooks();

    await handlers.get("updateToken")({ id: "token" }, { delta: { system: { hp: { value: 0 } } } });
    expect(roll).toHaveBeenCalledTimes(1);

    // A fresh combat verifies the linked-actor path independently.
    const second = combatFixture("second-combat");
    await handlers.get("updateActor")(second.actor, { system: { hp: { value: 0 } } });
    expect(roll).toHaveBeenCalledTimes(2);
  });
});
