import { daysBetween, toRomeDate, todayInRome } from "./followup/dates";

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const shortDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });
const shortDateYear = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" });
const longDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
const time = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

export function formatEuro(value: number | null | undefined) {
  return value == null ? "—" : euro.format(value);
}

function asDate(value: Date | string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
}

/** "22 ott", e con l'anno se non è quello in corso ("22 ott 2025"): una data vecchia non deve sembrare recente. */
export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = asDate(value);
  const sameYear = toRomeDate(d).slice(0, 4) === todayInRome().slice(0, 4);
  return (sameYear ? shortDate : shortDateYear).format(d);
}

/** Con l'anno: per gli eventi, che coprono più anni. */
export function formatDateYear(value: Date | string | null | undefined) {
  return value ? shortDateYear.format(asDate(value)) : "—";
}

export function formatLongDate(value: Date | string | null | undefined) {
  return value ? longDate.format(asDate(value)) : "—";
}

export function formatTime(value: Date | string) {
  return time.format(new Date(value));
}

/** "oggi", "ieri", "3 giorni fa", "tra 2 giorni" */
export function relativeDay(value: Date | string | null | undefined, today = todayInRome()) {
  if (!value) return "—";
  const diff = daysBetween(today, toRomeDate(value));
  if (diff === 0) return "oggi";
  if (diff === -1) return "ieri";
  if (diff === 1) return "domani";
  if (diff < 0) return diff > -60 ? `${-diff} giorni fa` : formatDate(value);
  return diff < 60 ? `tra ${diff} giorni` : formatDate(value);
}

export function fullName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`.trim();
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
