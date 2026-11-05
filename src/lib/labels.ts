/** Etichette in italiano e colori di stato. Il colore comunica uno stato, non decora. */

export const STAGE = {
  lead: { label: "Lead", tone: "neutral" },
  in_progress: { label: "In progress", tone: "cold" },
  vinta: { label: "Vinta", tone: "ok" },
  persa: { label: "Persa", tone: "bad" },
} as const;

export const MODE = {
  caldo: { label: "Caldo", tone: "hot" },
  freddo: { label: "Freddo", tone: "cold" },
  nessuno: { label: "Nessuno", tone: "neutral" },
} as const;

export const RELATIONSHIP = {
  prospect: { label: "Prospect", tone: "cold" },
  cliente: { label: "Cliente", tone: "ok" },
  partner: { label: "Partner", tone: "brand" },
  fornitore: { label: "Fornitore", tone: "neutral" },
  interno: { label: "Interno", tone: "neutral" },
} as const;

export const HEALTH = {
  verde: { label: "In linea", tone: "ok" },
  giallo: { label: "Da seguire", tone: "warn" },
  rosso: { label: "A rischio", tone: "bad" },
} as const;

export const TASK_STATUS = {
  proposto: { label: "Proposto", tone: "brand" },
  da_fare: { label: "Da fare", tone: "neutral" },
  in_corso: { label: "In corso", tone: "cold" },
  fatto: { label: "Fatto", tone: "ok" },
} as const;

export const PRIORITY = {
  alta: { label: "Alta", tone: "bad" },
  media: { label: "Media", tone: "neutral" },
  bassa: { label: "Bassa", tone: "neutral" },
} as const;

export const PROJECT_STATUS = {
  da_avviare: "Da avviare",
  attivo: "Attivo",
  in_pausa: "In pausa",
  chiuso: "Chiuso",
} as const;

export const STRENGTH = {
  molto_forte: { label: "Molto forte", level: 4 },
  forte: { label: "Forte", level: 3 },
  media: { label: "Media", level: 2 },
  debole: { label: "Debole", level: 1 },
  nessuna: { label: "Nessuna", level: 0 },
} as const;

export const LOST_REASON = {
  prezzo: "Prezzo",
  tempistica: "Tempistica",
  nessuna_risposta: "Nessuna risposta",
  concorrente: "Scelto un concorrente",
  annullato: "Progetto annullato",
  altro: "Altro",
} as const;

export const MET_VIA = {
  evento: "Evento",
  programma: "Programma o mentorship",
  passaparola: "Passaparola",
  linkedin: "LinkedIn",
  inbound: "Inbound",
  rete_esistente: "Rete esistente",
  altro: "Altro",
} as const;

export const INTERACTION = {
  email_inviata: "Email inviata",
  email_ricevuta: "Email ricevuta",
  meeting: "Meeting",
  chiamata: "Chiamata",
  nota_vocale: "Nota vocale",
  nota: "Nota",
  modifica_valore: "Cambio di valore",
} as const;

export const FACT_KIND = {
  bisogno: "Bisogno",
  budget: "Budget",
  tempistica: "Tempistica",
  obiezione: "Obiezione",
  preferenza: "Preferenza",
  contesto: "Contesto",
} as const;

export const SUGGESTION_REASON = {
  servizio: "Servizio",
  bando: "Bando",
  segnale: "Segnale",
  dormiente: "Cliente dormiente",
  ripresa: "Deal da riprendere",
} as const;

export const MEETING_SOURCE = {
  meet: "Google Meet",
  nota_vocale: "Nota vocale",
  audio: "Audio caricato",
  manuale: "Calendario",
} as const;

export type Tone = "neutral" | "brand" | "hot" | "cold" | "ok" | "warn" | "bad";

/** Sfondo tenue e testo pieno dello stesso colore di stato (design: classi c-hot, c-cold, ...). */
export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-neutral-bg text-neutral",
  brand: "bg-brand-bg text-brand",
  hot: "bg-hot-bg text-hot",
  cold: "bg-cold-bg text-cold",
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
};

export const DOT_CLASS: Record<Tone, string> = {
  neutral: "bg-neutral",
  brand: "bg-brand",
  hot: "bg-hot",
  cold: "bg-cold",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};
