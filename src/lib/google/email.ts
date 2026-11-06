/**
 * Indirizzi email: lettura delle intestazioni e regole su chi è un contatto vero.
 * Funzioni pure, usate dalla sincronizzazione di Gmail.
 */

export type Address = { name: string | null; email: string };

/** "Mario Rossi <mario@acme.com>, \"Rossi, Anna\" <anna@acme.com>, luca@acme.com" */
export function parseAddressList(header: string | null | undefined): Address[] {
  if (!header) return [];
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  let angle = false;
  for (const ch of header) {
    if (ch === '"') quoted = !quoted;
    if (ch === "<") angle = true;
    if (ch === ">") angle = false;
    if (ch === "," && !quoted && !angle) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const out: Address[] = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const m = p.match(/^(.*)<([^>]+)>\s*$/);
    const email = (m ? m[2] : p).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const name = m ? m[1].trim().replace(/^"|"$/g, "").trim() : "";
    out.push({ name: name && name.toLowerCase() !== email ? name : null, email });
  }
  return out;
}

export const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

/** Domini di posta personale: non dicono a quale azienda appartiene una persona. */
const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.it",
  "live.com",
  "live.it",
  "yahoo.com",
  "yahoo.it",
  "icloud.com",
  "me.com",
  "libero.it",
  "virgilio.it",
  "tiscali.it",
  "alice.it",
  "proton.me",
  "protonmail.com",
]);
export const isFreeMail = (email: string) => FREE_MAIL.has(domainOf(email));

/** Mittenti automatici: notifiche, newsletter, rimbalzi. Non diventano mai contatti. */
const AUTOMATED = /^(no-?reply|do-?not-?reply|notifications?|notify|newsletter|news|mailer-daemon|postmaster|bounces?|alerts?|updates|calendar-notification|drive-shares-dm-noreply)([+._-].*)?@/;

export function isAutomated(email: string, headers: { listUnsubscribe?: string | null; precedence?: string | null } = {}) {
  if (AUTOMATED.test(email)) return true;
  if (headers.listUnsubscribe) return true;
  return /^(bulk|list|junk)$/i.test(headers.precedence?.trim() ?? "");
}

/**
 * Esclusi: domini interni, indirizzi o domini nella lista Esclusi (Impostazioni).
 * Una voce della lista può essere un indirizzo intero o un dominio (con o senza @).
 */
export function isExcluded(email: string, internalDomains: string[], excluded: string[]) {
  const domain = domainOf(email);
  if (internalDomains.some((d) => d.toLowerCase() === domain)) return true;
  return excluded.some((x) => {
    const e = x.trim().toLowerCase();
    return e === email || e.replace(/^@/, "") === domain || (e.endsWith("@") && email.startsWith(e));
  });
}

/** Nome e cognome da "Mario Rossi", "Rossi, Mario" o dall'indirizzo stesso. */
export function splitName(a: Address): { firstName: string; lastName: string } {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (a.name) {
    const n = a.name.replace(/\s+/g, " ").trim();
    if (n.includes(",")) {
      const [last, first] = n.split(",").map((x) => x.trim());
      return { firstName: first || last, lastName: first ? last : "" };
    }
    const [first, ...rest] = n.split(" ");
    return { firstName: first, lastName: rest.join(" ") };
  }
  const local = a.email.split("@")[0].split("+")[0];
  const bits = local.split(/[._-]+/).filter(Boolean).map(cap);
  return { firstName: bits[0] ?? local, lastName: bits.slice(1).join(" ") };
}

/** Lo snippet di Gmail arriva con le entità HTML. */
export function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
