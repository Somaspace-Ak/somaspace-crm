"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { bankBalances, cashCategoryEnum, cashCertaintyEnum, cashMovements, cashStatusEnum, projects, settings } from "@/db/schema";
import { todayInRome } from "@/lib/followup/dates";
import { addMonths, monthKey } from "@/lib/finance/forecast";
import { canSeeFinance } from "./finance";
import { requireViewer } from "./session";

/** Azioni della finanza: solo i fondatori, verificato a ogni chiamata. */

type Result<T = { id: string }> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

async function requireFounder() {
  const viewer = await requireViewer();
  if (!canSeeFinance(viewer)) throw new Error("La finanza è riservata ai fondatori");
  return viewer;
}

function refresh() {
  revalidatePath("/", "layout");
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida");
const amount = z.coerce.number().positive("L'importo deve essere positivo").max(100_000_000);
const optionalText = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .nullable()
  .transform((v) => v || null);

const movementInput = z.object({
  direction: z.enum(["entrata", "uscita"]),
  category: z.enum(cashCategoryEnum.enumValues),
  title: z.string().trim().min(1, "Scrivi la voce").max(300),
  amount,
  dueOn: isoDate.optional().nullable(),
  status: z.enum(cashStatusEnum.enumValues).default("previsto"),
  certainty: z.enum(cashCertaintyEnum.enumValues).default("sicuro"),
  companyId: z.string().uuid().optional().nullable(),
  counterparty: optionalText,
  projectId: z.string().uuid().optional().nullable(),
  opportunityId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  invoiceRef: optionalText,
  notes: optionalText,
  // Una voce che si ripete: una per mese, stesso giorno, fino a questo mese compreso
  repeatUntil: isoDate.optional().nullable(),
});

export async function createMovement(input: z.input<typeof movementInput>): Promise<Result<{ id: string; count: number }>> {
  const viewer = await requireFounder();
  const parsed = movementInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dati non validi");
  const { repeatUntil, ...v } = parsed.data;
  if (repeatUntil && !v.dueOn) return fail("Per ripetere la voce serve la data della prima");

  // Il progetto porta con sé il cliente
  if (v.projectId && !v.companyId && !v.counterparty) {
    const [p] = await db.select({ companyId: projects.companyId }).from(projects).where(eq(projects.id, v.projectId));
    if (p?.companyId) v.companyId = p.companyId;
  }

  const dates = [v.dueOn ?? null];
  if (repeatUntil && v.dueOn) {
    const day = Number(v.dueOn.slice(8, 10));
    for (let k = addMonths(monthKey(v.dueOn), 1); k <= monthKey(repeatUntil) && dates.length < 36; k = addMonths(k, 1)) {
      const [y, m] = k.split("-").map(Number);
      const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
      dates.push(`${k}-${String(Math.min(day, last)).padStart(2, "0")}`);
    }
  }
  const paidOn = v.status === "pagato" ? (v.dueOn ?? todayInRome()) : null;
  const rows = await db
    .insert(cashMovements)
    .values(dates.map((dueOn, i) => ({ ...v, dueOn, status: i === 0 ? v.status : "previsto", paidOn: i === 0 ? paidOn : null, createdBy: viewer.id })))
    .returning({ id: cashMovements.id });
  refresh();
  return { ok: true, data: { id: rows[0]!.id, count: rows.length } };
}

/** Segna incassato o pagato, oggi o alla data data. */
export async function markMovementPaid(id: string, on?: string): Promise<Result> {
  await requireFounder();
  const day = on && isoDate.safeParse(on).success ? on : todayInRome();
  const [row] = await db
    .update(cashMovements)
    .set({ status: "pagato", paidOn: day, updatedAt: new Date() })
    .where(eq(cashMovements.id, id))
    .returning({ id: cashMovements.id });
  if (!row) return fail("Voce non trovata");
  refresh();
  return { ok: true, data: { id } };
}

export async function deleteMovement(id: string): Promise<Result> {
  await requireFounder();
  await db.delete(cashMovements).where(eq(cashMovements.id, id));
  refresh();
  return { ok: true, data: { id } };
}

const balanceInput = z.object({ on: isoDate, amount: z.coerce.number().min(-100_000_000).max(100_000_000), account: optionalText, note: optionalText });

/** Il saldo della banca a una data: da qui riparte il previsionale. */
export async function addBankBalance(input: z.input<typeof balanceInput>): Promise<Result> {
  const viewer = await requireFounder();
  const parsed = balanceInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dati non validi");
  if (parsed.data.on > todayInRome()) return fail("Il saldo è quello di oggi o di un giorno passato");
  const [row] = await db
    .insert(bankBalances)
    .values({ on: parsed.data.on, amount: parsed.data.amount, account: parsed.data.account ?? "Conto principale", note: parsed.data.note, createdBy: viewer.id })
    .returning({ id: bankBalances.id });
  refresh();
  return { ok: true, data: { id: row!.id } };
}

export async function deleteBankBalance(id: string): Promise<Result> {
  await requireFounder();
  await db.delete(bankBalances).where(eq(bankBalances.id, id));
  refresh();
  return { ok: true, data: { id } };
}

const settingsInput = z.object({
  reserve: z.coerce.number().min(0).max(10_000_000),
  months: z.coerce.number().int().min(1).max(24),
});

export async function saveFinanceSettings(input: z.input<typeof settingsInput>): Promise<Result> {
  await requireFounder();
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dati non validi");
  await db
    .insert(settings)
    .values({ key: "finance", value: parsed.data })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed.data } });
  refresh();
  return { ok: true, data: { id: "finance" } };
}
