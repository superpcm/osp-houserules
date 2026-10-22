import { describe, expect, it } from "vitest";
import { validateDepositSource } from "./deposit-source.js";

function item(overrides = {}) {
  const data = { id: "i1", name: "Ruby", type: "item", system: { treasure: true, quantity: 4 }, ...overrides };
  return { ...data, toObject: () => structuredClone(data) };
}

function actor(source) {
  return { items: { get: (id) => id === source.id ? source : undefined } };
}

describe("validateDepositSource", () => {
  it.each([0, -1, 1.5, 5, NaN])("rejects invalid or excessive quantity %s", (quantity) => {
    const source = item();
    expect(validateDepositSource(actor(source), source, quantity).success).toBe(false);
  });

  it("accepts a valid live treasure stack and uses its current quantity", () => {
    const source = item();
    const result = validateDepositSource(actor(source), source, 4);
    expect(result).toMatchObject({ success: true, item: source });
  });

  it("rejects a replaced or foreign reference even when its id matches", () => {
    const live = item();
    const stale = item();
    expect(validateDepositSource(actor(live), stale, 1).success).toBe(false);
    expect(validateDepositSource({ items: { get: () => live } }, { ...live, parent: {} }, 1).success).toBe(false);
  });

  it("rejects ordinary and non-inventory item types for bank deposits", () => {
    for (const source of [item({ type: "weapon" }), item({ system: { treasure: false, quantity: 4 } })]) {
      expect(validateDepositSource(actor(source), source, 1).success).toBe(false);
    }
  });

  it("derives canonical currency denomination and rejects mismatches", () => {
    const source = item({ name: "Gold Coins", type: "coin", system: { quantity: 4 } });
    expect(validateDepositSource(actor(source), source, 1, { currency: true, denomination: "gold" })).toMatchObject({ success: true, denomination: "gold" });
    expect(validateDepositSource(actor(source), source, 1, { currency: true, denomination: "silver" }).success).toBe(false);
    expect(validateDepositSource(actor(item({ name: "Gold", type: "coin" })), item({ name: "Gold", type: "coin" }), 1, { currency: true }).success).toBe(false);
  });
});

