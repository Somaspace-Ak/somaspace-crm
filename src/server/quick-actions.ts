"use server";

import { and, eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { companies, events, interactionPeople, interactions, people, taskAssignees, tasks } from "@/db/schema";
import { addDays, todayInRome } from "@/lib/followup/dates";
import { aiEnabled, type Card, type Recap, readCard, recapConversation } from "./ai";
import { recomputeFollowups, refreshLastInteractions } from "./followups";
import { requireViewer } from "./session";
import { createScribeToken, transcriptionEnabled } from "./transcribe";

/**
 * Inserimento veloce dal telefono (/veloce): biglietto da visita, nota vocale, salvataggio in un colpo.
 * Tutto per chi è entrato; i dati restano visibili al team come il resto del CRM.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const imageInput = z
  .array(
    z.object({
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      // ~3 MB in base64 al massimo per foto, già ridotta dal telefono
      data: z.string().min(100).max(3_000_000),
    }),
  )
  .min(1)
  .max(2);

/** Fronte e retro del biglietto → i campi già compilati. */
export async function scanBusinessCard(images: z.input<typeof imageInput>): Promise<Result<Card>> {
  await requireViewer();
  if (!aiEnabled) return { ok: false, error: "La lettura automatica non è attiva: manca la chiave di Claude. Compila a mano." };
  const parsed = imageInput.safeParse(images);
  if (!parsed.success) return { ok: false, error: "Foto non valida" };
  try {
    return { ok: true, data: await readCard(parsed.data) };
  } catch (e) {
    console.error("scanBusinessCard", e);
    return { ok: false, error: "Non sono riuscito a leggere il biglietto. Riprova con più luce, o compila a mano." };
  }
}

const recapInput = z.object({
  transcript: z.string().trim().min(10, "Troppo corto per un recap").max(500_000),
  person: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  event: z.string().trim().max(200).optional(),
});

/** Trascrizione o appunti → recap, prossimi passi, interessi, caldo/freddo. */
export async function recapNote(input: z.input<typeof recapInput>): Promise<Result<Recap>> {
  await requireViewer();
  if (!aiEnabled) return { ok: false, error: "Il recap automatico non è attivo: manca la chiave di Claude. La trascrizione si salva lo stesso." };
  const parsed = recapInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Testo non valido" };
  try {
    return { ok: true, data: await recapConversation(parsed.data) };
  } catch (e) {
    console.error("recapNote", e);
    return { ok: false, error: "Recap non riuscito. La trascrizione si salva lo stesso." };
  }
}

/** Gettone monouso per ElevenLabs: il telefono manda la nota vocale direttamente a loro. */
export async function startTranscription(): Promise<Result<{ token: string }>> {
  await requireViewer();
  if (!transcriptionEnabled) return { ok: false, error: "La trascrizione non è attiva: manca la chiave di ElevenLabs." };
  try {
    return { ok: true, data: { token: await createScribeToken() } };
  } catch (e) {
    console.error("startTranscription", e);
    return { ok: false, error: "Non riesco ad avviare la trascrizione. Riprova." };
  }
}

// Domini di posta personale: non dicono niente dell'azienda
const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.it",
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
  "pec.it",
]);

const domainOf = (website?: string | null, email?: string | null) => {
  const fromSite = website
    ?.replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    ?.toLowerCase();
  if (fromSite) return fromSite;
  const fromMail = email?.split("@")[1]?.toLowerCase();
  return fromMail && !PERSONAL_DOMAINS.has(fromMail) ? fromMail : undefined;
};

const optional = z
  .string()
  .trim()
  .max(500)
  .transform((v) => v || undefined)
  .optional();

const saveInput = z.object({
  companyId: z.string().uuid().nullable().optional(),
  companyName: optional,
  website: optional,
  country: optional,
  firstName: optional,
  lastName: optional,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Email non valida")
    .or(z.literal(""))
    .transform((v) => v || undefined)
    .optional(),
  phone: optional,
  position: optional,
  linkedin: optional,
  eventId: z.string().uuid().nullable().optional(),
  newEventName: optional,
  followupMode: z.enum(["caldo", "freddo", "nessuno"]).nullable().optional(),
  noteTitle: optional,
  recap: z.string().trim().max(6000).optional(),
  transcript: z.string().trim().max(500_000).optional(),
  interests: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  steps: z
    .array(z.object({ title: z.string().trim().min(1).max(300), dueInDays: z.number().int().min(0).max(365) }))
    .max(15)
    .optional(),
});

export type QuickSaved = {
  companyId: string | null;
  personId: string | null;
  companyCreated: boolean;
  personCreated: boolean;
  tasks: number;
};

/** Salva tutto: azienda (o quella che c'è già), persona (o quella con la stessa email), nota, task. */
export async function quickSave(input: z.input<typeof saveInput>): Promise<Result<QuickSaved>> {
  const viewer = await requireViewer();
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  const v = parsed.data;
  if (!v.companyId && !v.companyName && !v.firstName) return { ok: false, error: "Scrivi almeno il nome dell'azienda o della persona" };

  const today = todayInRome();
  const website = v.website && !/^https?:\/\//i.test(v.website) ? `https://${v.website}` : v.website;
  const linkedin = v.linkedin && !/^https?:\/\//i.test(v.linkedin) ? `https://${v.linkedin}` : v.linkedin;

  const saved = await db.transaction(async (tx) => {
    // Evento: quello scelto, o uno nuovo con la data di oggi (stesso nome = stesso evento)
    let eventId = v.eventId ?? null;
    if (!eventId && v.newEventName) {
      const [found] = await tx.select({ id: events.id }).from(events).where(sql`lower(${events.name}) = lower(${v.newEventName})`);
      eventId = found?.id ?? (await tx.insert(events).values({ name: v.newEventName, date: today, kind: "evento" }).returning())[0].id;
    }

    // Persona già nel CRM con la stessa email
    let person: typeof people.$inferSelect | undefined;
    if (v.email) {
      [person] = await tx
        .select()
        .from(people)
        .where(or(sql`lower(${people.email}) = ${v.email}`, sql`${v.email} = any(${people.otherEmails})`));
    }

    // Azienda: scelta, o stesso nome, o stesso dominio; altrimenti nuova
    let companyId = v.companyId ?? person?.companyId ?? null;
    let companyCreated = false;
    const domain = domainOf(website, v.email);
    if (!companyId && (v.companyName || domain)) {
      const [found] = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(
          or(
            v.companyName ? sql`lower(${companies.name}) = lower(${v.companyName})` : undefined,
            domain ? sql`${domain} = any(${companies.domains})` : undefined,
          ),
        )
        .limit(1);
      companyId = found?.id ?? null;
      if (!companyId && v.companyName) {
        const [c] = await tx
          .insert(companies)
          .values({
            name: v.companyName,
            website: website ?? null,
            domains: domain ? [domain] : [],
            country: v.country ?? null,
            relationship: "prospect",
            ownerId: viewer.id,
          })
          .returning({ id: companies.id });
        companyId = c.id;
        companyCreated = true;
      }
    }
    if (companyId && !companyCreated && (website || v.country)) {
      // Completa i campi vuoti, non sovrascrive niente
      await tx
        .update(companies)
        .set({
          website: sql`coalesce(${companies.website}, ${website ?? null})`,
          country: sql`coalesce(${companies.country}, ${v.country ?? null})`,
        })
        .where(eq(companies.id, companyId));
    }

    const noteText = v.recap || v.transcript;
    let personId = person?.id ?? null;
    let personCreated = false;
    if (person) {
      await tx
        .update(people)
        .set({
          companyId: person.companyId ?? companyId,
          phone: person.phone ?? v.phone ?? null,
          position: person.position ?? v.position ?? null,
          linkedin: person.linkedin ?? linkedin ?? null,
          eventId: person.eventId ?? eventId,
          interests: v.interests?.length ? [...new Set([...person.interests, ...v.interests])] : person.interests,
          followupMode: v.followupMode === undefined ? person.followupMode : v.followupMode,
        })
        .where(eq(people.id, person.id));
    } else if (v.firstName) {
      const [p] = await tx
        .insert(people)
        .values({
          firstName: v.firstName,
          lastName: v.lastName ?? "",
          email: v.email ?? null,
          companyId,
          position: v.position ?? null,
          phone: v.phone ?? null,
          linkedin: linkedin ?? null,
          metVia: eventId ? "evento" : null,
          eventId,
          interests: v.interests ?? [],
          firstMeetingNotes: v.recap ?? v.transcript?.slice(0, 2000) ?? null,
          followupMode: v.followupMode ?? null,
          ownerId: viewer.id,
          status: "attivo",
        })
        .returning({ id: people.id });
      personId = p.id;
      personCreated = true;
    }

    // La conversazione nella timeline, con la trascrizione intera
    if (noteText) {
      const who = v.firstName ? `${v.firstName} ${v.lastName ?? ""}`.trim() : v.companyName;
      const [i] = await tx
        .insert(interactions)
        .values({
          type: v.transcript ? "nota_vocale" : "nota",
          title: v.noteTitle ?? (who ? `Conversazione con ${who}` : "Conversazione"),
          occurredAt: new Date(),
          summary: v.recap ?? null,
          transcript: v.transcript ?? null,
          visibility: "team",
          ownerId: viewer.id,
          origin: "utente",
          companyId,
        })
        .returning({ id: interactions.id });
      if (personId) await tx.insert(interactionPeople).values({ interactionId: i.id, personId });
    }

    // Prossimi passi spuntati sul telefono → task miei, da fare
    let taskCount = 0;
    for (const s of v.steps ?? []) {
      const [t] = await tx
        .insert(tasks)
        .values({
          title: s.title,
          companyId,
          personId,
          status: "da_fare",
          origin: "manuale",
          dueOn: s.dueInDays > 0 ? addDays(today, s.dueInDays) : null,
          createdBy: viewer.id,
        })
        .returning({ id: tasks.id });
      await tx.insert(taskAssignees).values({ taskId: t.id, userId: viewer.id });
      taskCount++;
    }

    return { companyId, personId, companyCreated, personCreated, tasks: taskCount };
  });

  // Ultimo contatto e prossimo follow-up, fuori dalla transazione
  if (saved.personId) {
    await refreshLastInteractions(db, [saved.personId]);
    await recomputeFollowups(db, { people: [saved.personId] });
  }
  revalidatePath("/", "layout");
  return { ok: true, data: saved };
}

/** Aziende con questo nome o dominio: per avvisare prima di salvare. */
export async function findCompanyMatch(name: string, website?: string, email?: string) {
  await requireViewer();
  const domain = domainOf(website, email);
  const n = name.trim();
  if (!n && !domain) return null;
  const [found] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(and(or(n ? sql`lower(${companies.name}) = lower(${n})` : undefined, domain ? sql`${domain} = any(${companies.domains})` : undefined)))
    .limit(1);
  return found ?? null;
}
