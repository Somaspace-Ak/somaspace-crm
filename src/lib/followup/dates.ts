/**
 * Le date di follow-up sono giorni di calendario a Roma, scritti come "YYYY-MM-DD".
 * Lavorare con stringhe evita errori di fuso orario e cambi di ora legale.
 */
export type IsoDate = string;

const romeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Il giorno a Roma di un istante (un'email delle 23:30 UTC è già il giorno dopo a Roma). */
export function toRomeDate(value: Date | string): IsoDate {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return romeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function todayInRome(now: Date = new Date()): IsoDate {
  return toRomeDate(now);
}

export function addDays(day: IsoDate, days: number): IsoDate {
  const [y, m, d] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/** Giorni da `from` a `to` (positivo se `to` è dopo). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function maxDate(...days: (IsoDate | null | undefined)[]): IsoDate | null {
  let best: IsoDate | null = null;
  for (const day of days) if (day && (!best || day > best)) best = day;
  return best;
}
