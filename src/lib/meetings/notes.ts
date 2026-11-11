/**
 * Meeting di Google Meet: che cosa sono i file allegati all'evento e come si legge il recap
 * dalle note di Gemini (il documento che Meet salva in Drive e allega all'invito).
 */

export type MeetingDocKind = "registrazione" | "trascrizione" | "note" | "altro";

const GOOGLE_DOC = "application/vnd.google-apps.document";

/** Che cosa è un allegato di Meet, dal nome e dal tipo del file. */
export function docKind(a: { title: string; mimeType: string | null }): MeetingDocKind {
  const t = a.title.toLowerCase();
  if (a.mimeType?.startsWith("video/") || /registrazione|recording/.test(t)) return "registrazione";
  if (/trascrizione|transcript/.test(t)) return "trascrizione";
  if (/gemini|\bnote\b|\bnotes\b|appunti/.test(t)) return "note";
  return "altro";
}

/** Solo i documenti Google si possono esportare come testo. */
export const isGoogleDoc = (mimeType: string | null) => mimeType === GOOGLE_DOC;

/** L'id del file in Drive, dall'allegato o dal suo link. */
export function fileIdOf(a: { fileId?: string | null; url: string }) {
  if (a.fileId) return a.fileId;
  const m = a.url.match(/\/d\/([\w-]{10,})/) ?? a.url.match(/[?&]id=([\w-]{10,})/);
  return m?.[1] ?? null;
}

const SUMMARY = /^(summary|riepilogo|riassunto|sintesi)\s*:?$/i;
const NEXT_STEPS = /^(suggested next steps|next steps|action items|passaggi successivi( suggeriti)?|prossimi passi( suggeriti)?|azioni( suggerite)?)\s*:?$/i;
// Le altre intestazioni delle note di Gemini: chiudono la sezione in corso
const OTHER = /^(details|dettagli|notes|note|transcript|trascrizione|attachments|allegati|partecipanti|invited|invitati|meeting records|registrazioni della riunione)\s*:?$/i;
const BULLET = /^\s*(?:(?:[*\-•–]|\[[ xX]?\]|☐|☑|\d+[.)])\s*)+/;

/** Recap (il riepilogo) e prossimi passi dalle note di Gemini, in italiano o in inglese. */
export function parseGeminiNotes(text: string): { summary: string | null; nextSteps: string[] } {
  const lines = text.replace(/\r/g, "").replace(/\u00a0/g, " ").split("\n").map((l) => l.trim());
  let section: "summary" | "steps" | null = null;
  const summary: string[] = [];
  const steps: string[] = [];
  for (const line of lines) {
    if (SUMMARY.test(line)) {
      section = "summary";
      continue;
    }
    if (NEXT_STEPS.test(line)) {
      section = "steps";
      continue;
    }
    if (OTHER.test(line)) {
      section = null;
      continue;
    }
    if (!line) continue;
    if (section === "summary") summary.push(line);
    else if (section === "steps") {
      const step = line.replace(BULLET, "").trim();
      if (step) steps.push(step);
    }
  }
  let recap = summary.join("\n").trim();
  // Note senza intestazioni riconosciute: le prime righe di testo bastano come recap
  if (!recap) {
    recap = lines
      .filter((l) => l && !/^(meeting|riunione).*(started|iniziata)|^\d{1,2}[:.]\d{2}/i.test(l))
      .slice(0, 8)
      .join("\n");
  }
  return { summary: recap ? recap.slice(0, 4000) : null, nextSteps: steps.slice(0, 20).map((s) => s.slice(0, 400)) };
}

type ProjectRef = { id: string; name: string; companyId: string | null; status: string };

/**
 * Il progetto di un meeting: quello del cliente nominato nel titolo, oppure l'unico in corso del cliente.
 * Senza cliente (riunioni interne) solo se il titolo nomina un progetto, e uno solo.
 */
export function guessProject(projects: ProjectRef[], companyId: string | null, title: string): ProjectRef | null {
  const t = title.toLowerCase();
  const named = (list: ProjectRef[]) => list.filter((p) => p.name.trim().length >= 4 && t.includes(p.name.trim().toLowerCase()));
  if (companyId) {
    const theirs = projects.filter((p) => p.companyId === companyId);
    const byName = named(theirs);
    if (byName.length) return byName.sort((a, b) => b.name.length - a.name.length)[0];
    const running = theirs.filter((p) => p.status === "attivo" || p.status === "da_avviare");
    return running.length === 1 ? running[0] : null;
  }
  const byName = named(projects.filter((p) => p.status !== "chiuso"));
  return byName.length === 1 ? byName[0] : null;
}
