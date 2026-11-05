"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FollowupSettings } from "@/lib/followup/engine";
import { addExcludedAddress, removeExcludedAddress, saveFollowupSettings, saveGeneralSettings, saveSuggestionSettings } from "@/server/mutations";

function Row({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-1.5 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:gap-4">
      <div className="flex flex-col">
        <Label htmlFor={id} className="text-[13px] font-medium">
          {label}
        </Label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function DaysInput({ id, name, value }: { id: string; name: string; value: number }) {
  return (
    <span className="flex items-center gap-2">
      <Input id={id} name={name} type="number" min={1} defaultValue={value} className="h-8 w-20 text-right tabular-nums" required />
      <span className="w-12 text-xs text-muted-foreground">giorni</span>
    </span>
  );
}

/** Cadenze e regole dei follow-up: al salvataggio si ricalcolano tutte le date. */
export function FollowupSettingsForm({ value }: { value: FollowupSettings }) {
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => Number(f.get(k));
    start(async () => {
      const res = await saveFollowupSettings({
        warmDays: n("warmDays"),
        coldDays: n("coldDays"),
        quoteSequence: [n("q1"), n("q2"), n("q3"), n("q4")],
        staleLeadDays: n("staleLeadDays"),
        resumeAfterConversationDays: n("resume"),
        minGapDays: n("minGap"),
        maxDraftsPerDay: n("maxDrafts"),
      });
      if (res.ok) toast.success("Impostazioni salvate, date di follow-up ricalcolate");
      else toast.error(res.error);
    });
  };
  return (
    <form onSubmit={submit} className="overflow-hidden rounded-[10px] border bg-card">
      <Row id="warm" label="Cadenza Caldo" hint="Dopo quanti giorni dall'ultimo contatto">
        <DaysInput id="warm" name="warmDays" value={value.warmDays} />
      </Row>
      <Row id="cold" label="Cadenza Freddo" hint="Dopo quanti giorni dall'ultimo contatto">
        <DaysInput id="cold" name="coldDays" value={value.coldDays} />
      </Row>
      <Row id="q1" label="Sequenza preventivi" hint="Giorni dall'invio per i 4 passi">
        <span className="flex items-center gap-1.5">
          {value.quoteSequence.map((d, i) => (
            <Input
              key={i}
              id={`q${i + 1}`}
              name={`q${i + 1}`}
              type="number"
              min={1}
              defaultValue={d}
              aria-label={`Passo ${i + 1}`}
              className="h-8 w-14 text-right tabular-nums"
              required
            />
          ))}
          <span className="w-12 text-xs text-muted-foreground">giorni</span>
        </span>
      </Row>
      <Row id="resume" label="Ripresa dopo una risposta" hint="Se la conversazione si ferma, si riprende dopo">
        <DaysInput id="resume" name="resume" value={value.resumeAfterConversationDays} />
      </Row>
      <Row id="minGap" label="Distanza minima tra due follow-up" hint="Anche se un passo è in ritardo">
        <DaysInput id="minGap" name="minGap" value={value.minGapDays} />
      </Row>
      <Row id="stale" label="Lead fermo dopo" hint="Senza preventivo inviato">
        <DaysInput id="stale" name="staleLeadDays" value={value.staleLeadDays} />
      </Row>
      <Row id="maxDrafts" label="Bozze al giorno" hint="Le più in ritardo per prime, il resto resta in coda">
        <span className="flex items-center gap-2">
          <Input id="maxDrafts" name="maxDrafts" type="number" min={1} defaultValue={value.maxDraftsPerDay} className="h-8 w-20 text-right tabular-nums" required />
          <span className="w-12 text-xs text-muted-foreground">massimo</span>
        </span>
      </Row>
      <div className="flex justify-end bg-muted px-4 py-2.5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvo e ricalcolo…" : "Salva"}
        </Button>
      </div>
    </form>
  );
}

/** Soglie delle opportunità suggerite: al salvataggio si ricontrollano subito. */
export function SuggestionSettingsForm({ dormantDays }: { dormantDays: number }) {
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const res = await saveSuggestionSettings({ dormantDays: Number(f.get("dormantDays")) });
      if (res.ok) toast.success(`Salvato. ${res.data.created} suggerimenti nuovi, ${res.data.removed} tolti`);
      else toast.error(res.error);
    });
  };
  return (
    <form onSubmit={submit} className="overflow-hidden rounded-[10px] border bg-card">
      <Row id="dormant" label="Cliente dormiente dopo" hint="Senza contatti né progetti in corso">
        <DaysInput id="dormant" name="dormantDays" value={dormantDays} />
      </Row>
      <div className="flex justify-end bg-muted px-4 py-2.5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvo e ricontrollo…" : "Salva"}
        </Button>
      </div>
    </form>
  );
}

/** Digest, domini interni e categorie delle aziende. */
export function GeneralSettingsForm({
  digest,
  internalDomains,
  categories,
}: {
  digest: { time: string; days: string };
  internalDomains: string[];
  categories: string[];
}) {
  const [pending, start] = useTransition();
  const list = (v: FormDataEntryValue | null) =>
    String(v ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const res = await saveGeneralSettings({
        digestTime: String(f.get("digestTime")),
        digestDays: String(f.get("digestDays")) as "lun-ven" | "tutti",
        internalDomains: list(f.get("internalDomains")),
        categories: list(f.get("categories")),
      });
      if (res.ok) toast.success("Impostazioni salvate");
      else toast.error(res.error);
    });
  };
  return (
    <form onSubmit={submit} className="overflow-hidden rounded-[10px] border bg-card">
      <Row id="digestTime" label="Orario del digest" hint="Ora italiana. Il digest arriva quando colleghiamo l'email (fase 4)">
        <span className="flex items-center gap-2">
          <Input id="digestTime" name="digestTime" type="time" defaultValue={digest.time} className="h-8 w-28" required />
          <select
            name="digestDays"
            aria-label="Giorni del digest"
            defaultValue={digest.days}
            className="h-8 rounded-md border bg-background px-2 text-[13px]"
          >
            <option value="lun-ven">Lun–ven</option>
            <option value="tutti">Tutti i giorni</option>
          </select>
        </span>
      </Row>
      <Row id="internalDomains" label="Domini interni" hint="Mai registrati come contatti. Separati da virgola">
        <Input id="internalDomains" name="internalDomains" defaultValue={internalDomains.join(", ")} className="h-8 sm:w-72" />
      </Row>
      <Row id="categories" label="Categorie azienda" hint="I valori proposti nella scheda. Separati da virgola">
        <Input id="categories" name="categories" defaultValue={categories.join(", ")} className="h-8 sm:w-72" />
      </Row>
      <div className="flex justify-end bg-muted px-4 py-2.5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvo…" : "Salva"}
        </Button>
      </div>
    </form>
  );
}

/** Indirizzi e domini che l'agente ignora: newsletter, notifiche, fornitori di servizi. */
export function ExcludedAddresses({ items }: { items: { address: string; reason: string | null }[] }) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await addExcludedAddress(value);
      if (res.ok) setValue("");
      else toast.error(res.error);
    });
  };
  return (
    <div className="overflow-hidden rounded-[10px] border bg-card">
      <ul className="divide-y">
        {items.length ? null : <li className="px-4 py-3 text-[13px] text-muted-foreground">Nessun indirizzo escluso.</li>}
        {items.map((x) => (
          <li key={x.address} className="flex items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{x.address}</span>
            {x.reason ? <span className="hidden truncate text-xs text-muted-foreground sm:inline">{x.reason}</span> : null}
            <button
              type="button"
              aria-label={`Togli ${x.address}`}
              disabled={pending}
              onClick={() => start(async () => void (await removeExcludedAddress(x.address)))}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2 border-t bg-muted px-4 py-2.5">
        <label htmlFor="excluded-new" className="sr-only">
          Nuovo indirizzo o dominio da escludere
        </label>
        <Input
          id="excluded-new"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="newsletter@ o dominio.com"
          className="h-8 bg-background"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending || !value.trim()}>
          Escludi
        </Button>
      </form>
    </div>
  );
}
