import { describe, expect, it } from "vitest";
import { unshout } from "./unshout";

describe("unshout", () => {
  it("abbassa i nomi tutti maiuscoli", () => {
    expect(unshout("ORBITAL PARTS")).toBe("Orbital Parts");
    expect(unshout("GMV AEROSPACE")).toBe("GMV Aerospace");
    expect(unshout("D'ANGELO")).toBe("D'angelo");
  });
  it("lascia stare sigle e nomi già scritti bene", () => {
    expect(unshout("ESA")).toBe("ESA");
    expect(unshout("Orbital Parts")).toBe("Orbital Parts");
    expect(unshout("2NDSPACE")).toBe("2ndspace");
    expect(unshout("")).toBe("");
  });
});
