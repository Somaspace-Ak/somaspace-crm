import type { Category, Certainty, Direction } from "./forecast";

/**
 * Il previsionale di cassa Somaspace nov 26 – feb 27 (v7, 8/11/2026), riga per riga.
 * Il foglio ragiona per mese; qui ogni voce ha una data: quella indicata quando c'è, altrimenti metà mese
 * (o la fine per tasse e scadenze). Importi netti IVA, come nel foglio.
 * `company` e `project` sono nomi da cercare nel CRM; se non ci sono resta il nome scritto.
 */

export type SheetItem = {
  direction: Direction;
  category: Category;
  title: string;
  amount: number;
  dueOn: string;
  certainty?: Certainty;
  company?: string;
  counterparty?: string;
  project?: string;
  user?: string;
  notes?: string;
};

export const SHEET_BALANCE = { on: "2026-11-08", amount: 7789.1, note: "Dal previsionale v7 di Michele" };
export const SHEET_RESERVE = 4000;

const monthly = (base: Omit<SheetItem, "dueOn" | "amount">, amounts: [string, number][]): SheetItem[] =>
  amounts.filter(([, a]) => a > 0).map(([dueOn, amount]) => ({ ...base, dueOn, amount }));

export const SHEET_ITEMS: SheetItem[] = [
  // Incassi da contratti firmati
  {
    direction: "entrata",
    category: "contratto",
    title: "Oris, saldo alla consegna",
    amount: 1159,
    dueOn: "2026-12-15",
    company: "Oris",
    project: "Review sito + social plan",
    notes: "Saldo 50% su consegna modifiche sito e social. Mese ipotizzato.",
  },
  {
    direction: "entrata",
    category: "contratto",
    title: "ESA BIC Padova, workshop",
    amount: 976,
    dueOn: "2027-01-15",
    counterparty: "ESA BIC Padova",
    notes: "800 + IVA. Workshop nov/dic, pagamento ipotizzato a 30 giorni.",
  },
  {
    direction: "entrata",
    category: "contratto",
    title: "FluidWire, MS1 consegna modelli 3D (40%)",
    amount: 5612,
    dueOn: "2026-12-15",
    company: "FluidWireRobotics",
    project: "Terrestrial products render",
    notes: "Incasso stimato a metà dicembre.",
  },
  {
    direction: "entrata",
    category: "contratto",
    title: "FluidWire, saldo consegna asset (35%)",
    amount: 4910.5,
    dueOn: "2027-01-15",
    certainty: "a_rischio",
    company: "FluidWireRobotics",
    project: "Terrestrial products render",
    notes: "Incasso stimato a metà gennaio. Nello scenario prudente slitta oltre febbraio.",
  },

  // Uscite
  {
    direction: "uscita",
    category: "tasse",
    title: "F24 rateizzazione 2025, rata 2/6",
    amount: 309.57,
    dueOn: "2026-11-30",
    counterparty: "Agenzia delle Entrate",
    notes: "Scadenza originale 31/08/2026, non risulta pagata. Va versata entro il 30/11 per non perdere la rateizzazione. Se è già pagata, segnala Pagato.",
  },
  {
    direction: "uscita",
    category: "tasse",
    title: "F24 rateizzazione 2025, rata 3/6",
    amount: 312.24,
    dueOn: "2026-11-30",
    counterparty: "Agenzia delle Entrate",
  },
  {
    direction: "uscita",
    category: "tasse",
    title: "F24 rateizzazione 2025, rata 4/6",
    amount: 314.88,
    dueOn: "2027-02-28",
    counterparty: "Agenzia delle Entrate",
    notes: "Scade il 1 marzo: tenuta in febbraio per prudenza.",
  },
  {
    direction: "uscita",
    category: "tasse",
    title: "Imposte di bilancio",
    amount: 597.32,
    dueOn: "2026-11-30",
    counterparty: "Agenzia delle Entrate",
    notes: "Da pagare entro novembre.",
  },
  {
    direction: "uscita",
    category: "commercialista",
    title: "Commercialista, un trimestre",
    amount: 1100,
    dueOn: "2026-12-15",
    counterparty: "Commercialista",
    notes: "Importo da storico (1.098-1.099 a trimestre). Mese ipotizzato.",
  },
  {
    direction: "uscita",
    category: "collaboratori",
    title: "Haki Team, MS1 FluidWire (40% di 7.200)",
    amount: 2880,
    dueOn: "2026-12-15",
    counterparty: "Haki Team",
    project: "Terrestrial products render",
    notes: "7.200 totali, 25% già pagato, il resto in parallelo agli incassi FluidWire.",
  },
  ...monthly(
    { direction: "uscita", category: "costi_fissi", title: "Costi fissi (software, Google, banca, domini)", notes: "Media lug-set 2026, esclusi commercialista e una tantum." },
    [
      ["2026-11-15", 500],
      ["2026-12-15", 500],
      ["2027-01-15", 500],
      ["2027-02-15", 500],
    ],
  ),
  {
    direction: "uscita",
    category: "trasferte",
    title: "Viaggio Space Tech Expo Brema",
    amount: 500,
    dueOn: "2026-11-17",
    notes: "17-19/11. Almeno 500.",
  },
  ...monthly(
    { direction: "uscita", category: "trasferte", title: "Altre trasferte (Padova, Courmayeur, Torino)", notes: "Stima: metti 0 se rimborsate dai clienti o non previste." },
    [
      ["2026-11-20", 200],
      ["2026-12-15", 200],
      ["2027-01-15", 200],
      ["2027-02-15", 200],
    ],
  ),
  {
    direction: "uscita",
    category: "collaboratori",
    title: "Haki Team, saldo FluidWire (35% di 7.200)",
    amount: 2520,
    dueOn: "2027-01-15",
    certainty: "a_rischio",
    counterparty: "Haki Team",
    project: "Terrestrial products render",
    notes: "Pagato in parallelo al saldo FluidWire: se il saldo slitta, slitta anche questo.",
  },
  {
    direction: "uscita",
    category: "attrezzatura",
    title: "Strumenti di lavoro Alessia (Amazon Business)",
    amount: 500,
    dueOn: "2026-12-20",
    counterparty: "Amazon Business",
    notes: "Attrezzatura intestata a Somaspace. Dopo l'incasso MS1 FluidWire. Verificare inerenza con il commercialista.",
  },
  ...monthly(
    { direction: "uscita", category: "imprevisti", title: "Imprevisti (margine di prudenza)", notes: "Costi che oggi non vediamo: software, rinnovi, eventi, altri fornitori." },
    [
      ["2026-11-30", 300],
      ["2026-12-31", 300],
      ["2027-01-31", 300],
      ["2027-02-28", 300],
    ],
  ),

  // Compensi pianificati
  ...monthly(
    { direction: "uscita", category: "compensi", title: "Compenso Michele", user: "Michele Rosari", notes: "Novembre 450: tetto 1.000 su ott+nov. Da dicembre 500 al mese fino a febbraio, poi si rivaluta." },
    [
      ["2026-11-30", 450],
      ["2026-12-31", 500],
      ["2027-01-31", 500],
      ["2027-02-28", 500],
    ],
  ),
  ...monthly(
    { direction: "uscita", category: "compensi", title: "Compenso Giordano", user: "Giordano Fagiolo", notes: "Novembre 50: tetto 1.000 su ott+nov. Da dicembre 500 al mese fino a febbraio, poi si rivaluta." },
    [
      ["2026-11-30", 50],
      ["2026-12-31", 500],
      ["2027-01-31", 500],
      ["2027-02-28", 500],
    ],
  ),
];
