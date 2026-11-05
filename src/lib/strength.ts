import { daysBetween, type IsoDate } from "./followup/dates";

export type Strength = "molto_forte" | "forte" | "media" | "debole" | "nessuna";

export const STRENGTH_ORDER: Strength[] = ["nessuna", "debole", "media", "forte", "molto_forte"];

export interface StrengthInput {
  today: IsoDate;
  sentOn: IsoDate[];
  receivedOn: IsoDate[];
  meetingsOn: IsoDate[];
}

/**
 * Forza della relazione, specifica sezione 7: semplice e spiegabile.
 * Email inviate negli ultimi 90 giorni ×1, ricevute ×2, meeting negli ultimi 180 giorni ×4,
 * moltiplicato per quanto è recente l'ultima interazione.
 */
export function strengthScore({ today, sentOn, receivedOn, meetingsOn }: StrengthInput): number {
  const within = (days: number) => (d: IsoDate) => {
    const age = daysBetween(d, today);
    return age >= 0 && age <= days;
  };
  const raw =
    sentOn.filter(within(90)).length * 1 +
    receivedOn.filter(within(90)).length * 2 +
    meetingsOn.filter(within(180)).length * 4;

  const all = [...sentOn, ...receivedOn, ...meetingsOn].sort();
  if (!all.length) return 0;
  const age = daysBetween(all[all.length - 1], today);
  const freshness = age <= 30 ? 1 : age <= 90 ? 0.7 : age <= 180 ? 0.4 : 0.2;
  return raw * freshness;
}

/** Soglie iniziali, da tarare dopo un mese sui dati reali. */
export function strengthLevel(score: number): Strength {
  if (score >= 20) return "molto_forte";
  if (score >= 10) return "forte";
  if (score >= 5) return "media";
  if (score > 0) return "debole";
  return "nessuna";
}

/** L'azienda prende il livello della persona con la relazione più forte. */
export function strongest(levels: Strength[]): Strength {
  return levels.reduce<Strength>(
    (best, l) => (STRENGTH_ORDER.indexOf(l) > STRENGTH_ORDER.indexOf(best) ? l : best),
    "nessuna",
  );
}
