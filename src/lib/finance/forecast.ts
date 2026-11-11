/**
 * Il previsionale di cassa, come nel foglio di Michele: si parte dall'ultimo saldo della banca,
 * si aggiungono gli incassi e si tolgono uscite e compensi, mese per mese.
 *
 * Regole:
 * - una voce pagata entro la data del saldo è già nel saldo: non si conta;
 * - una voce pagata dopo si conta nel mese in cui è stata pagata;
 * - una voce non pagata si conta nel mese previsto; se la data è passata, nel mese in corso (è in ritardo);
 * - una voce senza data è "da pianificare": si vede a parte e non entra nei conti;
 * - lo scenario prudente toglie le voci a rischio non ancora pagate.
 */

export type Direction = "entrata" | "uscita";
export type Category =
  | "contratto"
  | "altro_incasso"
  | "compensi"
  | "fornitori"
  | "collaboratori"
  | "tasse"
  | "commercialista"
  | "costi_fissi"
  | "trasferte"
  | "attrezzatura"
  | "imprevisti"
  | "altro";
export type CashStatus = "previsto" | "fatturato" | "pagato";
export type Certainty = "sicuro" | "a_rischio";
export type Scenario = "firmati" | "prudente";
export type Check = "ok" | "attenzione" | "scoperto";

export type ForecastMovement = {
  id: string;
  direction: Direction;
  category: Category;
  title: string;
  amount: number;
  dueOn: string | null;
  status: CashStatus;
  paidOn: string | null;
  certainty: Certainty;
  userId?: string | null;
};

export type ForecastRow = {
  key: string;
  title: string;
  category: Category;
  atRisk: boolean;
  late: boolean;
  byMonth: number[];
  total: number;
  ids: string[];
};

export type ForecastMonth = { key: string; label: string; start: number; income: number; expenses: number; pay: number; end: number; check: Check };

export type Forecast = {
  months: ForecastMonth[];
  income: ForecastRow[];
  expenses: ForecastRow[];
  pay: ForecastRow[];
  totals: { income: number; expenses: number; pay: number };
  startCash: number;
  endCash: number;
  reserve: number;
  margin: number;
  /** Il compenso mensile per persona che lascia intatta la riserva a fine periodo (come nel foglio). */
  sustainablePay: number | null;
  unplanned: ForecastMovement[];
  late: ForecastMovement[];
  beyond: { income: number; expenses: number };
};

const MONTH_FMT = new Intl.DateTimeFormat("it-IT", { month: "short", timeZone: "UTC" });

export const monthKey = (iso: string) => iso.slice(0, 7);

export function addMonths(key: string, n: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string) {
  const d = new Date(`${key}-01T00:00:00Z`);
  const m = MONTH_FMT.format(d).replace(".", "");
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${key.slice(2, 4)}`;
}

/** Ultimo giorno del mese, per "Cassa prevista al 28/02". */
export function monthEnd(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

const round = (n: number) => Math.round(n * 100) / 100;

export function checkOf(end: number, reserve: number): Check {
  if (end < 0) return "scoperto";
  if (end < reserve * 0.5) return "attenzione";
  return "ok";
}

export function buildForecast(input: {
  movements: ForecastMovement[];
  balance: { on: string; amount: number } | null;
  today: string;
  months: number;
  scenario: Scenario;
  reserve: number;
  /** Persone a compenso, per il compenso sostenibile */
  paidPeople?: number;
}): Forecast {
  const { movements, balance, today, scenario, reserve } = input;
  const firstKey = monthKey(balance && balance.on < today ? balance.on : today);
  const keys = Array.from({ length: Math.max(1, input.months) }, (_, i) => addMonths(firstKey, i));
  const lastKey = keys[keys.length - 1]!;
  const todayKey = monthKey(today);
  const startCash = balance?.amount ?? 0;

  const sections = { income: new Map<string, ForecastRow>(), expenses: new Map<string, ForecastRow>(), pay: new Map<string, ForecastRow>() };
  const unplanned: ForecastMovement[] = [];
  const late: ForecastMovement[] = [];
  const beyond = { income: 0, expenses: 0 };

  for (const mv of movements) {
    const paid = mv.status === "pagato";
    if (paid) {
      // Già nel saldo della banca
      if (!mv.paidOn || (balance && mv.paidOn <= balance.on)) continue;
    } else if (scenario === "prudente" && mv.certainty === "a_rischio") continue;

    let key: string;
    let isLate = false;
    if (paid) key = monthKey(mv.paidOn!);
    else if (!mv.dueOn) {
      unplanned.push(mv);
      continue;
    } else {
      isLate = mv.dueOn < today;
      if (isLate) late.push(mv);
      key = [monthKey(mv.dueOn), todayKey, firstKey].sort().at(-1)!;
    }
    if (key > lastKey) {
      if (mv.direction === "entrata") beyond.income += mv.amount;
      else beyond.expenses += mv.amount;
      continue;
    }
    const idx = Math.max(0, keys.indexOf(key));

    const section = mv.direction === "entrata" ? sections.income : mv.category === "compensi" ? sections.pay : sections.expenses;
    const rowKey = `${mv.category}|${mv.userId ?? ""}|${mv.title.trim().toLowerCase()}`;
    let row = section.get(rowKey);
    if (!row) {
      row = { key: rowKey, title: mv.title, category: mv.category, atRisk: false, late: false, byMonth: keys.map(() => 0), total: 0, ids: [] };
      section.set(rowKey, row);
    }
    row.byMonth[idx]! += mv.amount;
    row.total += mv.amount;
    row.ids.push(mv.id);
    if (!paid && mv.certainty === "a_rischio") row.atRisk = true;
    if (isLate) row.late = true;
  }

  const sum = (rows: ForecastRow[], i: number) => round(rows.reduce((s, r) => s + r.byMonth[i]!, 0));
  const sortRows = (m: Map<string, ForecastRow>) =>
    [...m.values()]
      .map((r) => ({ ...r, total: round(r.total), byMonth: r.byMonth.map(round) }))
      .sort((a, b) => firstMonth(a) - firstMonth(b) || b.total - a.total);
  const income = sortRows(sections.income);
  const expenses = sortRows(sections.expenses);
  const pay = sortRows(sections.pay);

  let cash = startCash;
  const months: ForecastMonth[] = keys.map((key, i) => {
    const m = { key, label: monthLabel(key), start: round(cash), income: sum(income, i), expenses: sum(expenses, i), pay: sum(pay, i), end: 0, check: "ok" as Check };
    cash = round(cash + m.income - m.expenses - m.pay);
    m.end = cash;
    m.check = checkOf(cash, reserve);
    return m;
  });

  const totals = {
    income: round(months.reduce((s, m) => s + m.income, 0)),
    expenses: round(months.reduce((s, m) => s + m.expenses, 0)),
    pay: round(months.reduce((s, m) => s + m.pay, 0)),
  };
  const people = input.paidPeople ?? 0;
  return {
    months,
    income,
    expenses,
    pay,
    totals,
    startCash,
    endCash: cash,
    reserve,
    margin: round(cash - reserve),
    sustainablePay: people > 0 ? round(Math.max(0, startCash + totals.income - totals.expenses - reserve) / keys.length / people) : null,
    unplanned,
    late,
    beyond: { income: round(beyond.income), expenses: round(beyond.expenses) },
  };
}

const firstMonth = (r: ForecastRow) => {
  const i = r.byMonth.findIndex((v) => v !== 0);
  return i < 0 ? 99 : i;
};
