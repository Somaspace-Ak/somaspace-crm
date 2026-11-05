"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { todayInRome } from "@/lib/followup/dates";
import { MET_VIA, MODE, PRIORITY, PROJECT_STATUS, RELATIONSHIP } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  addInteraction,
  createCompany,
  createOpportunity,
  createPerson,
  createProject,
  createTask,
  type Result,
} from "@/server/mutations";
import { Combobox, MultiPicker } from "./combobox";
import { useFormOptions } from "./form-options";

export type CreateKind = "azienda" | "persona" | "opportunita" | "progetto" | "task" | "interazione";
export type CreateDefaults = {
  companyId?: string;
  personId?: string;
  projectId?: string;
  parentId?: string;
  opportunityId?: string;
};

const EVENT = "crm:create";

export function openCreate(kind: CreateKind, defaults: CreateDefaults = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind, defaults } }));
}

export const CREATE_LABEL: Record<CreateKind, string> = {
  azienda: "Nuova azienda",
  persona: "Nuova persona",
  opportunita: "Nuova opportunità",
  progetto: "Nuovo progetto",
  task: "Nuovo task",
  interazione: "Aggiungi interazione",
};

export function CreateButton({
  kind,
  defaults,
  label,
  variant = "outline",
  size = "sm",
}: {
  kind: CreateKind;
  defaults?: CreateDefaults;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default";
}) {
  return (
    <Button variant={variant} size={size} onClick={() => openCreate(kind, defaults)}>
      <Plus aria-hidden />
      {label ?? CREATE_LABEL[kind]}
    </Button>
  );
}

/** Montato una volta nel layout: apre il form giusto da qualunque schermata. */
export function CreateDialogs() {
  const [state, setState] = useState<{ kind: CreateKind; defaults: CreateDefaults; key: number } | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const { kind, defaults } = (e as CustomEvent<{ kind: CreateKind; defaults: CreateDefaults }>).detail;
      setState({ kind, defaults, key: Date.now() });
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  return (
    <Dialog open={state !== null} onOpenChange={(o) => !o && setState(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {state ? <CreateForm key={state.key} kind={state.kind} defaults={state.defaults} onDone={() => setState(null)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

const DESCRIPTION: Record<CreateKind, string> = {
  azienda: "Basta il nome. Il resto si completa dalla scheda.",
  persona: "Una persona per email: se l'indirizzo esiste già, te lo dico.",
  opportunita: "Con la data di invio del preventivo il deal parte in In progress e scatta la sequenza di follow-up.",
  progetto: "Un progetto per cliente, con il suo team e i suoi task.",
  task: "Assegnato a te se non scegli nessuno.",
  interazione: "Chiamate e incontri fuori calendario. Aggiorna l'ultimo contatto e i follow-up.",
};

function CreateForm({ kind, defaults, onDone }: { kind: CreateKind; defaults: CreateDefaults; onDone: () => void }) {
  const router = useRouter();
  const lists = useFormOptions();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Scelte con ricerca
  const [companyId, setCompanyId] = useState<string | null>(defaults.companyId ?? null);
  const [newCompanyName, setNewCompanyName] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(defaults.personId ?? null);
  const [projectId, setProjectId] = useState<string | null>(defaults.projectId ?? null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const users = lists.users.map((u) => ({ value: u.id, label: u.name }));
  const companies = [
    ...(newCompanyName ? [{ value: "__new__", label: `${newCompanyName} (nuova)` }] : []),
    ...lists.companies.map((c) => ({ value: c.id, label: c.name })),
  ];
  const people = lists.people
    .filter((p) => !companyId || companyId === "__new__" || p.companyId === companyId)
    .map((p) => ({ value: p.id, label: p.name }));
  const projects = lists.projects.map((p) => ({ value: p.id, label: p.name }));

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = f.get(k);
      return typeof v === "string" && v.trim() ? v.trim() : undefined;
    };
    const realCompany = companyId && companyId !== "__new__" ? companyId : null;
    setError(null);

    start(async () => {
      let res: Result;
      let href: string | null = null;
      switch (kind) {
        case "azienda":
          res = await createCompany({
            name: get("name") ?? "",
            website: get("website"),
            country: get("country"),
            relationship: get("relationship") as never,
            ownerId,
          });
          if (res.ok) href = `/companies/${res.data.id}`;
          break;
        case "persona":
          res = await createPerson({
            firstName: get("firstName") ?? "",
            lastName: get("lastName"),
            email: get("email") ?? "",
            companyId: realCompany,
            newCompanyName: companyId === "__new__" ? (newCompanyName ?? undefined) : undefined,
            position: get("position"),
            phone: get("phone"),
            linkedin: get("linkedin"),
            ownerId,
            followupMode: (get("followupMode") as never) ?? null,
            metVia: (get("metVia") as never) ?? null,
            firstMeetingNotes: get("firstMeetingNotes"),
          });
          if (res.ok) href = `/people/${res.data.id}`;
          break;
        case "opportunita":
          if (!realCompany) {
            setError("Scegli l'azienda");
            return;
          }
          res = await createOpportunity({
            name: get("name") ?? "",
            companyId: realCompany,
            personId,
            ownerId,
            initialValue: get("initialValue") ? Number(get("initialValue")!.replace(/\./g, "").replace(",", ".")) : null,
            quoteSentOn: get("quoteSentOn") ?? null,
            notes: get("notes"),
          });
          if (res.ok) href = `/pipeline/${res.data.id}`;
          break;
        case "progetto":
          res = await createProject({
            name: get("name") ?? "",
            companyId: realCompany,
            ownerId,
            status: get("status") as never,
            startOn: get("startOn") ?? null,
            dueOn: get("dueOn") ?? null,
            description: get("description"),
            memberIds,
          });
          if (res.ok) href = `/progetti/${res.data.id}`;
          break;
        case "task":
          res = await createTask({
            title: get("title") ?? "",
            projectId,
            parentId: defaults.parentId ?? null,
            dueOn: get("dueOn") ?? null,
            priority: get("priority") as never,
            assigneeIds: memberIds,
            description: get("description"),
          });
          break;
        case "interazione":
          res = await addInteraction({
            type: (get("type") as never) ?? "nota",
            title: get("title") ?? "",
            summary: get("summary"),
            date: get("date") ?? todayInRome(),
            personId,
            companyId: realCompany,
            opportunityId: defaults.opportunityId ?? null,
            projectId,
          });
          break;
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const what = CREATE_LABEL[kind].replace(/^Nuov[oa] /, "");
      toast.success(kind === "interazione" ? "Interazione registrata" : `${what[0].toUpperCase()}${what.slice(1)} creat${kind === "progetto" || kind === "task" ? "o" : "a"}`);
      onDone();
      if (href) router.push(href);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{CREATE_LABEL[kind]}</DialogTitle>
        <DialogDescription>{DESCRIPTION[kind]}</DialogDescription>
      </DialogHeader>

      {kind === "azienda" ? (
        <>
          <Field label="Nome" id="c-name">
            <Input id="c-name" name="name" required autoFocus />
          </Field>
          <Row>
            <Field label="Sito web" id="c-site">
              <Input id="c-site" name="website" placeholder="esempio.com" />
            </Field>
            <Field label="Nazione" id="c-country">
              <Input id="c-country" name="country" />
            </Field>
          </Row>
          <Row>
            <Field label="Relazione" id="c-rel">
              <NativeSelect id="c-rel" name="relationship" defaultValue="prospect" options={Object.entries(RELATIONSHIP).map(([v, o]) => [v, o.label])} />
            </Field>
            <Field label="Owner" id="c-owner">
              <Combobox id="c-owner" options={users} value={ownerId} onChange={setOwnerId} placeholder="Io" />
            </Field>
          </Row>
        </>
      ) : null}

      {kind === "persona" ? (
        <>
          <Row>
            <Field label="Nome" id="p-first">
              <Input id="p-first" name="firstName" required autoFocus />
            </Field>
            <Field label="Cognome" id="p-last">
              <Input id="p-last" name="lastName" />
            </Field>
          </Row>
          <Field label="Email" id="p-email">
            <Input id="p-email" name="email" type="email" />
          </Field>
          <Field label="Azienda" id="p-company">
            <Combobox
              id="p-company"
              options={companies}
              value={companyId}
              onChange={(v) => {
                setCompanyId(v);
                if (v !== "__new__") setNewCompanyName(null);
              }}
              placeholder="Scegli o crea un'azienda"
              createLabel={(q) => `Crea l'azienda "${q}"`}
              onCreate={(q) => {
                setNewCompanyName(q);
                setCompanyId("__new__");
              }}
            />
          </Field>
          <Row>
            <Field label="Ruolo" id="p-pos">
              <Input id="p-pos" name="position" />
            </Field>
            <Field label="Telefono" id="p-phone">
              <Input id="p-phone" name="phone" />
            </Field>
          </Row>
          <Row>
            <Field label="Follow-up" id="p-mode">
              <NativeSelect id="p-mode" name="followupMode" defaultValue="" options={[["", "Da decidere"], ...Object.entries(MODE).map(([v, o]) => [v, o.label] as [string, string])]} />
            </Field>
            <Field label="Come l'abbiamo conosciuto" id="p-met">
              <NativeSelect id="p-met" name="metVia" defaultValue="" options={[["", "—"], ...Object.entries(MET_VIA)]} />
            </Field>
          </Row>
          <Field label="Owner" id="p-owner">
            <Combobox id="p-owner" options={users} value={ownerId} onChange={setOwnerId} placeholder="Quello dell'azienda" />
          </Field>
          <Field label="Note del primo meeting" id="p-notes">
            <Textarea id="p-notes" name="firstMeetingNotes" rows={2} />
          </Field>
        </>
      ) : null}

      {kind === "opportunita" ? (
        <>
          <Field label="Nome del deal" id="o-name">
            <Input id="o-name" name="name" required autoFocus placeholder="Es. Sito web 2027" />
          </Field>
          <Row>
            <Field label="Azienda" id="o-company">
              <Combobox
                id="o-company"
                options={companies}
                value={companyId}
                onChange={(v) => {
                  setCompanyId(v);
                  setPersonId(null);
                }}
                placeholder="Obbligatoria"
              />
            </Field>
            <Field label="Referente" id="o-person">
              <Combobox id="o-person" options={people} value={personId} onChange={setPersonId} placeholder="Serve per i follow-up" />
            </Field>
          </Row>
          <Row>
            <Field label="Valore iniziale (€)" id="o-value">
              <Input id="o-value" name="initialValue" inputMode="decimal" />
            </Field>
            <Field label="Preventivo inviato il" id="o-sent">
              <Input id="o-sent" name="quoteSentOn" type="date" />
            </Field>
          </Row>
          <Field label="Owner" id="o-owner">
            <Combobox id="o-owner" options={users} value={ownerId} onChange={setOwnerId} placeholder="Io" />
          </Field>
          <Field label="Note" id="o-notes">
            <Textarea id="o-notes" name="notes" rows={2} />
          </Field>
        </>
      ) : null}

      {kind === "progetto" ? (
        <>
          <Field label="Nome del progetto" id="pr-name">
            <Input id="pr-name" name="name" required autoFocus />
          </Field>
          <Row>
            <Field label="Cliente" id="pr-company">
              <Combobox id="pr-company" options={companies} value={companyId} onChange={setCompanyId} placeholder="Interno se vuoto" />
            </Field>
            <Field label="Stato" id="pr-status">
              <NativeSelect id="pr-status" name="status" defaultValue="da_avviare" options={Object.entries(PROJECT_STATUS)} />
            </Field>
          </Row>
          <Row>
            <Field label="Inizio" id="pr-start">
              <Input id="pr-start" name="startOn" type="date" defaultValue={todayInRome()} />
            </Field>
            <Field label="Consegna" id="pr-due">
              <Input id="pr-due" name="dueOn" type="date" />
            </Field>
          </Row>
          <Row>
            <Field label="Owner" id="pr-owner">
              <Combobox id="pr-owner" options={users} value={ownerId} onChange={setOwnerId} placeholder="Io" />
            </Field>
            <Field label="Team" id="pr-team">
              <MultiPicker options={users} value={memberIds} onChange={setMemberIds} />
            </Field>
          </Row>
          <Field label="Descrizione" id="pr-desc">
            <Textarea id="pr-desc" name="description" rows={2} />
          </Field>
        </>
      ) : null}

      {kind === "task" ? (
        <>
          <Field label="Titolo" id="t-title">
            <Input id="t-title" name="title" required autoFocus />
          </Field>
          {defaults.parentId ? null : (
            <Field label="Progetto" id="t-project">
              <Combobox id="t-project" options={projects} value={projectId} onChange={setProjectId} placeholder="Nessun progetto" />
            </Field>
          )}
          <Row>
            <Field label="Scadenza" id="t-due">
              <Input id="t-due" name="dueOn" type="date" />
            </Field>
            <Field label="Priorità" id="t-prio">
              <NativeSelect id="t-prio" name="priority" defaultValue="media" options={Object.entries(PRIORITY).map(([v, o]) => [v, o.label])} />
            </Field>
          </Row>
          <Field label="Assegnato a" id="t-assignees">
            <MultiPicker options={users} value={memberIds} onChange={setMemberIds} placeholder="A me" />
          </Field>
          <Field label="Descrizione" id="t-desc">
            <Textarea id="t-desc" name="description" rows={2} />
          </Field>
        </>
      ) : null}

      {kind === "interazione" ? (
        <>
          <Row>
            <Field label="Tipo" id="i-type">
              <NativeSelect
                id="i-type"
                name="type"
                defaultValue="chiamata"
                options={[
                  ["chiamata", "Chiamata"],
                  ["meeting", "Incontro"],
                  ["nota", "Nota"],
                ]}
              />
            </Field>
            <Field label="Data" id="i-date">
              <Input id="i-date" name="date" type="date" defaultValue={todayInRome()} required />
            </Field>
          </Row>
          <Field label="Titolo" id="i-title">
            <Input id="i-title" name="title" required autoFocus placeholder="Es. Chiamata sul preventivo" />
          </Field>
          <Field label="Com'è andata" id="i-summary">
            <Textarea id="i-summary" name="summary" rows={3} />
          </Field>
          {defaults.personId ? null : (
            <Field label="Persona" id="i-person">
              <Combobox id="i-person" options={people} value={personId} onChange={setPersonId} placeholder="Facoltativa" />
            </Field>
          )}
        </>
      ) : null}

      {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Annulla
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvo…" : kind === "interazione" ? "Registra" : "Crea"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row">{children}</div>;
}

function NativeSelect({
  id,
  name,
  defaultValue,
  options,
  className,
}: {
  id: string;
  name: string;
  defaultValue: string;
  options: (readonly [string, string])[];
  className?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      className={cn("h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40", className)}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
