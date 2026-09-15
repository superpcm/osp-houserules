import { describe, expect, it } from "vitest";
import { isStorehouseEligible } from "./storehouse.js";

describe("storehouse eligibility", () => {
  it("accepts ordinary gear, weapons, armor, ammunition, and clothing", () => {
    for (const type of ["item", "weapon", "armor", "ammunition", "clothing"]) {
      expect(isStorehouseEligible({ type, system: {} })).toBe(true);
    }
  });

  it("routes treasure and coins to the bank", () => {
    expect(isStorehouseEligible({ type: "item", system: { treasure: true } })).toBe(false);
    expect(isStorehouseEligible({ type: "coin", system: {} })).toBe(false);
  });

  it("rejects containers so their nested contents cannot be lost", () => {
    expect(isStorehouseEligible({ type: "container", system: {} })).toBe(false);
  });
});
