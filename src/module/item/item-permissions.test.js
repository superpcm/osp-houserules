import { describe, expect, it, beforeEach, vi } from "vitest";

describe("BR-06 item permissions", () => {
  beforeEach(() => {
    vi.stubGlobal("Item", class {
      testUserPermission(_user, permission) { return permission === "OBSERVER"; }
      prepareData() {}
    });
    vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } });
  });

  it("delegates observation to Foundry ownership", async () => {
    const { OspItem } = await import("./item.js");
    const item = new OspItem();
    expect(item.testUserPermission({}, "OBSERVER")).toBe(true);
  });
});
