"use server";

import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { companies, interactionPeople, interactions, opportunities, people } from "@/db/schema";
import { formatDate } from "@/lib/format";
import { INTERACTION } from "@/lib/labels";
import { aiEnabled, writeFollowupEmail } from "./ai";
import { requireViewer } from "./session";

/**
 * "Apri bozza" in Oggi: Claude scrive la mail di follow-up dallo storico del contatto,
 * l'app apre Gmail con destinatario, oggetto e testo già pronti. Si rivede e si manda da lì.
 * Niente nuovi permessi Google: la mail parte dalla casella di chi la apre.
 */

export type FollowupEmail = { to: string; subject: string; body: string; account: string | null };
type Result = { ok: true; data: FollowupEmail } | { ok: false; error: string };

const input = z.object({ kind: z.enum(["persona", "opportunita"]), id: z.string().uuid() });

export async function prepareFollowupEmail(raw: z.input<typeof input>): Promise<Result> {
  const viewer = await requireViewer();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Voce non valida" };
  const { kind, id } = parsed.data;

  let personId: string | null = id;
  let purpose = "";
  let opportunityId: string | null = null;
  if (kind === "opportunita") {
    const [o] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    if (!o) return { ok: false, error: "Opportunità non trovata" };
    personId = o.personId;
    opportunityId = o.id;
    purpose = `Promemoria gentile sul preventivo "${o.name}"${o.quoteSentOn ? ` inviato il ${formatDate(o.quoteSentOn)}` : ""}: chiedere se l'hanno visto e se serve chiarire qualcosa. È il promemoria numero ${o.followupStep + 1}.`;
  }
  if (!personId) return { ok: false, error: "Nessun referente con email per questa voce" };

  const [row] = await db
    .select({ p: people, company: companies })
    .from(people)
    .leftJoin(companies, eq(companies.id, people.companyId))
    .where(eq(people.id, personId));
  if (!row?.p.email) return { ok: false, error: "Questa persona non ha un'email nel CRM" };
  const { p, company } = row;
  const email = row.p.email;
  if (!purpose) {
    purpose =
      p.followupMode === "caldo"
        ? "Contatto caldo da risentire: riprendere il filo dell'ultima conversazione e proporre un passo concreto (una call, un aggiornamento)."
        : "Contatto freddo: farsi risentire con leggerezza, ricordare chi siamo e lasciare la porta aperta, senza vendere.";
  }

  // Storico visibile a chi scrive: le email private degli altri fondatori restano fuori
  const visible = or(eq(interactions.visibility, "team"), eq(interactions.ownerId, viewer.id));
  const linked = [
    inArray(interactions.id, db.select({ id: interactionPeople.interactionId }).from(interactionPeople).where(eq(interactionPeople.personId, p.id))),
    opportunityId ? eq(interactions.opportunityId, opportunityId) : undefined,
  ].filter(Boolean);
  const history = await db
    .select({ type: interactions.type, title: interactions.title, summary: interactions.summary, at: interactions.occurredAt })
    .from(interactions)
    .where(and(visible, or(...linked)))
    .orderBy(desc(interactions.occurredAt))
    .limit(10);
  const lines = history.map((h) => `${formatDate(h.at)} · ${INTERACTION[h.type]} · ${h.title}${h.summary ? ` — ${h.summary.slice(0, 600)}` : ""}`);

  const firstName = viewer.name.split(" ")[0];
  const to = `${p.firstName} ${p.lastName}`.trim();
  const language = p.language === "en" ? "en" : "it";

  if (!aiEnabled) {
    return {
      ok: true,
      data: {
        to: email,
        account: viewer.email,
        subject: language === "en" ? "Catching up" : "Un saluto da Somaspace",
        body:
          language === "en"
            ? `Hi ${p.firstName},\n\nI hope all is well. I wanted to check in and see how things are going on your side.\n\nBest,\n${firstName}`
            : `Ciao ${p.firstName},\n\nspero tutto bene. Volevo risentirti per sapere come vanno le cose da voi.\n\nUn saluto,\n${firstName}`,
      },
    };
  }

  try {
    const draft = await writeFollowupEmail({
      from: `${viewer.name}, fondatore di Somaspace`,
      to,
      company: company?.name ?? null,
      position: p.position,
      language,
      purpose,
      history: lines,
    });
    return { ok: true, data: { to: email, account: viewer.email, ...draft } };
  } catch (e) {
    console.error("prepareFollowupEmail", e);
    return { ok: false, error: "Non sono riuscito a scrivere la bozza. Riprova." };
  }
}
