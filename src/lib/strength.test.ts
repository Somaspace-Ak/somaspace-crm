import { describe, expect, it } from "vitest";
import { strengthLevel, strengthScore, strongest } from "./strength";

describe("forza della relazione", () => {
  it("pesa email inviate, ricevute e meeting, poi la freschezza", () => {
    const score = strengthScore({
      today: "2026-11-04",
      sentOn: ["2026-10-20", "2026-10-25"],
      receivedOn: ["2026-10-26"],
      meetingsOn: ["2026-10-30"],
    });
    // 2×1 + 1×2 + 1×4 = 8, ultima interazione entro 30 giorni
    expect(score).toBe(8);
    expect(strengthLevel(score)).toBe("media");
  });

  it("una relazione ferma da mesi scende", () => {
    const score = strengthScore({
      today: "2026-11-04",
      sentOn: [],
      receivedOn: [],
      meetingsOn: ["2026-06-01", "2026-06-15", "2026-07-01"],
    });
    // 3×4 = 12, ultima interazione a 126 giorni: ×0,4
    expect(score).toBeCloseTo(4.8);
    expect(strengthLevel(score)).toBe("debole");
  });

  it("senza interazioni è Nessuna, e l'azienda prende il livello più forte", () => {
    expect(strengthLevel(strengthScore({ today: "2026-11-04", sentOn: [], receivedOn: [], meetingsOn: [] }))).toBe(
      "nessuna",
    );
    expect(strongest(["debole", "forte", "media"])).toBe("forte");
  });
});
