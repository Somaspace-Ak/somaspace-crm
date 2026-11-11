"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Landmark, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { todayInRome } from "@/lib/followup/dates";
import { CASH_CATEGORY } from "@/lib/labels";
import { addBankBalance, createMovement, deleteBankBalance, deleteMovement, markMovementPaid, saveFinanceSettings } from "@/server/finance-actions";
import { Combobox } from "./combobox";
import { Field, NativeSelect, Row } from "./create-dialogs";
import { useFormOptions } from "./form-options";

export type MovementDefaults = {
  direction?: "entrata" | "uscita";
  category?: keyof typeof CASH_CATEGORY;
  title?: string;
  amount?: number;
  companyId?: string | null;
  counterparty?: string | null;
  projectId?: string | null;
  opportunityId?: string | null;
};

/** Gli importi si scrivono all'italiana: 1.159,50 */
const parseAmount = (v: string) => Number(v.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));

/** Nuova voce di cassa: un incasso o un pagamento, anche ripetuto ogni mese. */
export function NewMovementButton({
  defaults = {},
  label,
  variant = "outline",
}: {
  defaults?: MovementDefaults;
  label?: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button
        variant={variant}
        size="sm"
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <Plus aria-hidden />
        {label ?? "Nuova voce"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {open ? <MovementForm key={key} defaults={defaults} onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MovementForm({ defaults, onDone }: { defaults: MovementDefaults; onDone: () => void }) {
  const router = useRouter();
  const lists = useFormOptions();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"entrata" | "uscita">(defaults.direction ?? "uscita");
  const [category, setCategory] = useState<string>(defaults.category ?? (direction === "entrata" ? "contratto" : "fornitori"));
  const [companyId, setCompanyId] = useState<string | null>(defaults.companyId ?? null);
  const [projectId, setProjectId] = useState<string | null>(defaults.projectId ?? null);
  const [userId, setUserId] = useState<string | null>(null);
  const [repeat, setRepeat] = useState(false);

  const categories = Object.entries(CASH_CATEGORY)
    .filter(([, c]) => c.direction === direction)
    .map(([v, c]) => [v, c.label] as [string, string]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = f.get(k);
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    const amount = parseAmount(get("amount") ?? "");
    if (!(amount > 0)) return setError("Scrivi l'importo");
    setError(null);
    start(async () => {
      const res = await createMovement({
        direction,
        category: category as never,
        title: get("title") ?? "",
        amount,
        dueOn: get("dueOn"),
        status: (get("status") as never) ?? "previsto",
        certainty: (get("certainty") as never) ?? "sicuro",
        companyId,
        counterparty: companyId ? null : get("counterparty"),
        projectId,
        opportunityId: defaults.opportunityId ?? null,
        userId: category === "compensi" ? userId : null,
        invoiceRef: get("invoiceRef"),
        notes: get("notes"),
        // Il campo mese dà "2027-02": basta il mese
        repeatUntil: repeat && get("repeatUntil") ? `${get("repeatUntil")!.slice(0, 7)}-01` : null,
      });
      if (!res.ok) return setError(res.error);
      toast.success(res.data.count > 1 ? `${res.data.count} voci create, una al mese` : direction === "entrata" ? "Incasso aggiunto" : "Uscita aggiunta");
      onDone();
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{direction === "entrata" ? "Nuovo incasso" : "Nuova uscita"}</DialogTitle>
        <DialogDescription>Entra nel previsionale alla sua data. Senza data resta tra le voci da pianificare.</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Entrata o uscita">
        {(["entrata", "uscita"] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={direction === d}
            onClick={() => {
              setDirection(d);
              setCategory(d === "entrata" ? "contratto" : "fornitori");
            }}
            className={
              direction === d ? "h-7 rounded-md bg-background text-[13px] font-medium shadow-xs" : "h-7 rounded-md text-[13px] font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {d === "entrata" ? "Entrata" : "Uscita"}
          </button>
        ))}
      </div>

      <Field label="Voce" id="mv-title">
        <Input id="mv-title" name="title" required autoFocus defaultValue={defaults.title} placeholder={direction === "entrata" ? "Acconto 50% sito" : "Fattura Haki Team"} />
      </Field>
      <Row>
        <Field label="Importo netto IVA (€)" id="mv-amount">
          <Input id="mv-amount" name="amount" inputMode="decimal" required defaultValue={defaults.amount ? String(defaults.amount).replace(".", ",") : ""} placeholder="1.200" />
        </Field>
        <Field label={direction === "entrata" ? "Quando arriva" : "Quando si paga"} id="mv-due">
          <Input id="mv-due" name="dueOn" type="date" />
        </Field>
      </Row>
      <Row>
        <Field label="Categoria" id="mv-cat">
          <select
            id="mv-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {categories.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stato" id="mv-status">
          <NativeSelect
            id="mv-status"
            name="status"
            defaultValue="previsto"
            options={
              direction === "entrata"
                ? [
                    ["previsto", "Previsto"],
                    ["fatturato", "Fatturato"],
                    ["pagato", "Già incassato"],
                  ]
                : [
                    ["previsto", "Previsto"],
                    ["fatturato", "Da pagare (fattura ricevuta)"],
                    ["pagato", "Già pagato"],
                  ]
            }
          />
        </Field>
      </Row>
      {category === "compensi" ? (
        <Field label="A chi" id="mv-user">
          <Combobox id="mv-user" options={lists.users.map((u) => ({ value: u.id, label: u.name }))} value={userId} onChange={setUserId} placeholder="Scegli" />
        </Field>
      ) : (
        <Row>
          <Field label={direction === "entrata" ? "Cliente" : "Fornitore nel CRM"} id="mv-company">
            <Combobox id="mv-company" options={lists.companies.map((c) => ({ value: c.id, label: c.name }))} value={companyId} onChange={setCompanyId} placeholder="Scegli" />
          </Field>
          {companyId ? null : (
            <Field label="Oppure scrivi il nome" id="mv-cp">
              <Input id="mv-cp" name="counterparty" defaultValue={defaults.counterparty ?? ""} placeholder="Commercialista" />
            </Field>
          )}
        </Row>
      )}
      <Row>
        <Field label="Progetto" id="mv-project">
          <Combobox id="mv-project" options={lists.projects.map((p) => ({ value: p.id, label: p.name }))} value={projectId} onChange={setProjectId} placeholder="Nessuno" />
        </Field>
        <Field label="Certezza" id="mv-cert">
          <NativeSelect
            id="mv-cert"
            name="certainty"
            defaultValue="sicuro"
            options={[
              ["sicuro", "Sicura"],
              ["a_rischio", "A rischio (può slittare)"],
            ]}
          />
        </Field>
      </Row>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="size-4 accent-foreground" />
          Si ripete ogni mese
        </label>
        {repeat ? (
          <Field label="Fino a (compreso)" id="mv-until">
            <Input id="mv-until" name="repeatUntil" type="month" required />
          </Field>
        ) : null}
      </div>
      <Row>
        <Field label="Fattura n." id="mv-inv">
          <Input id="mv-inv" name="invoiceRef" />
        </Field>
      </Row>
      <Field label="Note" id="mv-notes">
        <Textarea id="mv-notes" name="notes" rows={2} />
      </Field>
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvo…" : "Aggiungi"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Segna pagato" / "Segna incassato": oggi. */
export function MarkPaidButton({ id, direction, compact }: { id: string; direction: "entrata" | "uscita"; compact?: boolean }) {
  const [pending, start] = useTransition();
  const label = direction === "entrata" ? "Incassato" : "Pagato";
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className={compact ? "relative z-10 h-7 px-2 text-xs" : undefined}
      onClick={() =>
        start(async () => {
          const res = await markMovementPaid(id);
          if (!res.ok) toast.error(res.error);
          else toast.success(`Segnato ${label.toLowerCase()} oggi`);
        })
      }
    >
      <Check aria-hidden />
      {label}
    </Button>
  );
}

export function DeleteMovementButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
      onClick={() => {
        if (!window.confirm("Eliminare questa voce? Esce dal previsionale e non si recupera.")) return;
        start(async () => {
          const res = await deleteMovement(id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Voce eliminata");
          router.push("/finanza/movimenti");
        });
      }}
    >
      <Trash2 aria-hidden />
      Elimina
    </Button>
  );
}

/** Aggiorna il saldo della banca: il previsionale riparte da qui. */
export function BalanceButton({ variant = "outline" }: { variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = parseAmount(String(f.get("amount") ?? ""));
    if (Number.isNaN(amount)) return setError("Scrivi il saldo");
    start(async () => {
      const res = await addBankBalance({ on: String(f.get("on")), amount, account: String(f.get("account") ?? ""), note: String(f.get("note") ?? "") });
      if (!res.ok) return setError(res.error);
      toast.success("Saldo aggiornato: il previsionale riparte da qui");
      setOpen(false);
    });
  };
  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Landmark aria-hidden />
        Aggiorna saldo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Saldo della banca</DialogTitle>
              <DialogDescription>Quello che vedi oggi sul conto. Le voci pagate fino a questa data sono già dentro.</DialogDescription>
            </DialogHeader>
            <Row>
              <Field label="Saldo (€)" id="b-amount">
                <Input id="b-amount" name="amount" inputMode="decimal" required autoFocus placeholder="7.789,10" />
              </Field>
              <Field label="Alla data" id="b-on">
                <Input id="b-on" name="on" type="date" required defaultValue={todayInRome()} max={todayInRome()} />
              </Field>
            </Row>
            <Field label="Conto" id="b-acc">
              <Input id="b-acc" name="account" defaultValue="Conto principale" />
            </Field>
            <Field label="Nota" id="b-note">
              <Input id="b-note" name="note" />
            </Field>
            {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvo…" : "Salva il saldo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteBalanceButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label="Elimina il saldo"
      className="size-7 text-muted-foreground hover:text-destructive"
      onClick={() => {
        if (!window.confirm("Eliminare questo saldo?")) return;
        start(async () => {
          const res = await deleteBankBalance(id);
          if (!res.ok) toast.error(res.error);
        });
      }}
    >
      <Trash2 className="size-3.5" aria-hidden />
    </Button>
  );
}

export function FinanceSettingsForm({ reserve, months }: { reserve: number; months: number }) {
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const res = await saveFinanceSettings({ reserve: parseAmount(String(f.get("reserve") ?? "0")) || 0, months: Number(f.get("months")) });
      if (!res.ok) toast.error(res.error);
      else toast.success("Impostazioni salvate");
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-[10px] border bg-card p-4">
      <Row>
        <Field label="Riserva minima di cassa (€)" id="fs-reserve">
          <Input id="fs-reserve" name="reserve" inputMode="decimal" defaultValue={String(reserve).replace(".", ",")} />
        </Field>
        <Field label="Mesi del previsionale" id="fs-months">
          <Input id="fs-months" name="months" type="number" min={1} max={24} defaultValue={months} />
        </Field>
      </Row>
      <p className="text-xs text-muted-foreground">Sotto metà della riserva un mese diventa “Attenzione”; sotto zero “Scoperto”.</p>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvo…" : "Salva"}
        </Button>
      </div>
    </form>
  );
}
