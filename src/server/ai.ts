import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { unshout } from "@/lib/unshout";

/**
 * Claude per l'inserimento veloce: legge i biglietti da visita e riassume le note vocali.
 * Senza ANTHROPIC_API_KEY l'app funziona lo stesso: il modulo si compila a mano.
 */

export const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY);

const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
function anthropic() {
  if (!aiEnabled) throw new Error("Manca ANTHROPIC_API_KEY");
  client ??= new Anthropic();
  return client;
}

const text = z.string().describe("Stringa vuota se non c'è");

export const CardSchema = z.object({
  firstName: text,
  lastName: text,
  position: text.describe("Ruolo o titolo, come scritto sul biglietto"),
  email: text,
  phones: z.array(z.string()).describe("Numeri di telefono, con il prefisso internazionale se scritto"),
  linkedin: text.describe("URL completo del profilo LinkedIn, se c'è"),
  companyName: text.describe(
    "Nome dell'azienda, senza forma societaria (S.r.l., S.p.A., Ltd) se non fa parte del marchio. Maiuscole normali (Orbital Parts, non ORBITAL PARTS) tranne le sigle",
  ),
  website: text.describe("Sito dell'azienda, con https://"),
  country: text.describe("Paese dell'azienda in italiano, dall'indirizzo o dal prefisso"),
  address: text,
  other: text.describe("Altro di utile scritto sul biglietto (slogan, servizi, secondo contatto), una riga"),
});
export type Card = z.infer<typeof CardSchema>;

type Image = { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };

/** Fronte e retro del biglietto da visita → i campi di persona e azienda. */
export async function readCard(images: Image[]): Promise<Card> {
  const res = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Un biglietto è semplice: risposta rapida, siamo a un evento
    output_config: { effort: "low", format: betaZodOutputFormat(CardSchema) },
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.data } })),
          {
            type: "text",
            text:
              images.length > 1
                ? "Sono il fronte e il retro di un biglietto da visita. Estrai i dati della persona e della sua azienda. Copia nomi, email e numeri esattamente come sono scritti; non inventare niente che non si legga."
                : "È un biglietto da visita. Estrai i dati della persona e della sua azienda. Copia nomi, email e numeri esattamente come sono scritti; non inventare niente che non si legga.",
          },
        ],
      },
    ],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Non sono riuscito a leggere il biglietto");
  const card = res.parsed_output;
  return { ...card, companyName: unshout(card.companyName), firstName: unshout(card.firstName), lastName: unshout(card.lastName) };
}

export const RecapSchema = z.object({
  title: z.string().describe("Titolo breve della conversazione, massimo 8 parole"),
  recap: z.string().describe("Riassunto in italiano, 3-6 frasi: chi è, che cosa fa, che cosa cerca, che cosa ci siamo detti"),
  nextSteps: z
    .array(
      z.object({
        title: z.string().describe("Azione concreta per noi, all'infinito (es. Mandare il portfolio)"),
        dueInDays: z.number().int().describe("Entro quanti giorni da oggi (venerdì, la settimana prossima: contali dalla data di oggi); 0 se non è detto"),
      }),
    )
    .describe("Solo i prossimi passi detti o chiaramente concordati; lista vuota se non ce ne sono"),
  interests: z.array(z.string()).describe("Temi di interesse della persona, parole brevi"),
  temperature: z.enum(["caldo", "freddo"]).describe("caldo se c'è un interesse concreto a lavorare insieme a breve, altrimenti freddo"),
});
export type Recap = z.infer<typeof RecapSchema>;

/** La trascrizione (o gli appunti) di una conversazione → recap, prossimi passi, interessi. */
export async function recapConversation(input: { transcript: string; person?: string; company?: string; event?: string }): Promise<Recap> {
  // La data di oggi serve per "entro venerdì", "la settimana prossima"
  const today = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const context = [
    `Oggi è ${today}`,
    input.person ? `Persona: ${input.person}` : null,
    input.company ? `Azienda: ${input.company}` : null,
    input.event ? `Dove: ${input.event}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const res = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(RecapSchema) },
    system:
      "Lavori per Somaspace, un'agenzia italiana. Un fondatore ha appena parlato con un contatto (spesso a un evento) e ha dettato appunti o registrato la conversazione. La trascrizione automatica può avere errori: correggi i nomi evidenti, non inventare fatti. Scrivi in italiano, asciutto.",
    messages: [
      {
        role: "user",
        content: `${context ? `${context}\n\n` : ""}<trascrizione>\n${input.transcript}\n</trascrizione>`,
      },
    ],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Non sono riuscito a fare il recap");
  return res.parsed_output;
}
