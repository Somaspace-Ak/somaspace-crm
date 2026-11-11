import { describe, expect, it } from "vitest";
import { buildForecast, monthLabel, type ForecastMovement } from "./forecast";
import { SHEET_BALANCE, SHEET_ITEMS, SHEET_RESERVE } from "./previsionale-nov26";

const sheet: ForecastMovement[] = SHEET_ITEMS.map((it, i) => ({
  id: String(i),
  direction: it.direction,
  category: it.category,
  title: it.title,
  amount: it.amount,
  dueOn: it.dueOn,
  status: "previsto",
  paidOn: null,
  certainty: it.certainty ?? "sicuro",
}));

const base = { balance: SHEET_BALANCE, today: "2026-11-08", months: 4, reserve: SHEET_RESERVE, paidPeople: 2 };

describe("previsionale di cassa", () => {
  it("rifà i conti del foglio di Michele, mese per mese", () => {
    const f = buildForecast({ ...base, movements: sheet, scenario: "firmati" });
    expect(f.months.map((m) => m.label)).toEqual(["Nov 26", "Dic 26", "Gen 27", "Feb 27"]);
    expect(f.months.map((m) => m.income)).toEqual([0, 6771, 5886.5, 0]);
    expect(f.months.map((m) => m.expenses)).toEqual([2719.13, 5480, 3520, 1314.88]);
    expect(f.months.map((m) => m.pay)).toEqual([500, 1000, 1000, 1000]);
    expect(f.months.map((m) => m.end)).toEqual([4569.97, 4860.97, 6227.47, 3912.59]);
    expect(f.margin).toBeCloseTo(-87.41, 2);
    expect(f.sustainablePay).toBeCloseTo(426.57, 2);
    expect(f.months.every((m) => m.check === "ok")).toBe(true);
  });

  it("nello scenario prudente toglie le voci a rischio", () => {
    const f = buildForecast({ ...base, movements: sheet, scenario: "prudente" });
    expect(f.totals.income).toBe(7747);
    expect(f.endCash).toBeCloseTo(1522.09, 2);
    expect(f.months.at(-1)!.check).toBe("attenzione");
  });

  it("una voce pagata prima del saldo è già in banca; una pagata dopo conta quando è pagata", () => {
    const mv = (over: Partial<ForecastMovement>): ForecastMovement => ({
      id: "x",
      direction: "uscita",
      category: "fornitori",
      title: "Fattura",
      amount: 100,
      dueOn: "2026-11-20",
      status: "previsto",
      paidOn: null,
      certainty: "sicuro",
      ...over,
    });
    const f = buildForecast({
      ...base,
      today: "2026-11-25",
      scenario: "firmati",
      movements: [
        mv({ id: "a", status: "pagato", paidOn: "2026-11-02" }),
        mv({ id: "b", status: "pagato", paidOn: "2026-12-03", title: "Altra" }),
        mv({ id: "c", dueOn: "2026-10-31", title: "In ritardo" }),
        mv({ id: "d", dueOn: null, title: "Senza data" }),
        mv({ id: "e", dueOn: "2027-06-01", direction: "entrata", title: "Lontano" }),
      ],
    });
    expect(f.expenses.find((r) => r.title === "Fattura")).toBeUndefined();
    expect(f.expenses.find((r) => r.title === "Altra")!.byMonth).toEqual([0, 100, 0, 0]);
    const late = f.expenses.find((r) => r.title === "In ritardo")!;
    expect(late.byMonth).toEqual([100, 0, 0, 0]);
    expect(late.late).toBe(true);
    expect(f.unplanned.map((m) => m.id)).toEqual(["d"]);
    expect(f.beyond.income).toBe(100);
  });

  it("scrive i mesi in italiano", () => {
    expect(monthLabel("2027-01")).toBe("Gen 27");
  });
});
