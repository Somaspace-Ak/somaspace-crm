"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { LayoutGrid, List, X } from "lucide-react";
import { AvatarStack, CompanyLogo, HealthChip, UserAvatar } from "./chips";
import { EmptyState } from "./page-header";
import { countBy, FilterSelect, SortHeader, TableSearch, useSortedRows, ViewTabs } from "./sortable";
import { addDays, todayInRome } from "@/lib/followup/dates";
import { formatDate, relativeDay } from "@/lib/format";
import { HEALTH, PROJECT_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; initials: string };

export type ProjectRow = {
  id: string;
  name: string;
  company: { id: string; name: string } | null;
  status: keyof typeof PROJECT_STATUS;
  health: keyof typeof HEALTH;
  healthNote: string | null;
  dueOn: string | null;
  total: number;
  done: number;
  overdue: number;
  nextDue: string | null;
  owner: Person | null;
  team: Person[];
};

export type ProjectsLayout = "schede" | "lista";

const STATUS_ORDER = Object.keys(PROJECT_STATUS) as (keyof typeof PROJECT_STATUS)[];
const HEALTH_ORDER: Record<keyof typeof HEALTH, number> = { rosso: 0, giallo: 1, verde: 2 };

const DEADLINE = {
  in_ritardo: "Con task in ritardo",
  settimana: "Scadenze nei prossimi 7 giorni",
  mese: "Scadenze nei prossimi 30 giorni",
  senza: "Senza scadenze",
} as const;
type Deadline = keyof typeof DEADLINE;

function matchesDeadline(r: ProjectRow, d: Deadline, today: string) {
  switch (d) {
    case "in_ritardo":
      return r.overdue > 0;
    case "settimana":
      return !!r.nextDue && r.nextDue <= addDays(today, 7);
    case "mese":
      return !!r.nextDue && r.nextDue <= addDays(today, 30);
    case "senza":
      return !r.nextDue && !r.dueOn;
  }
}

const pct = (r: ProjectRow) => (r.total ? Math.round((r.done / r.total) * 100) : 0);

/** Progetti a schede o a lista, con filtri per stato, salute, cliente, persona e scadenze. */
export function ProjectsView({ rows, layout, emptyText }: { rows: ProjectRow[]; layout: ProjectsLayout; emptyText: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = todayInRome();

  const [status, setStatus] = useState<keyof typeof PROJECT_STATUS | null>(null);
  const [health, setHealth] = useState("");
  const [company, setCompany] = useState("");
  const [person, setPerson] = useState("");
  const [deadline, setDeadline] = useState("");

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!status || r.status === status) &&
          (!health || r.health === health) &&
          (!company || r.company?.id === company) &&
          (!person || r.owner?.id === person || r.team.some((u) => u.id === person)) &&
          (!deadline || matchesDeadline(r, deadline as Deadline, today)),
      ),
    [rows, status, health, company, person, deadline, today],
  );

  const options = useMemo(() => {
    const companies = new Map(rows.flatMap((r) => (r.company ? [[r.company.id, r.company.name] as const] : [])));
    const people = new Map(rows.flatMap((r) => [...(r.owner ? [r.owner] : []), ...r.team].map((u) => [u.id, u.name] as const)));
    return {
      health: (Object.keys(HEALTH) as (keyof typeof HEALTH)[]).map((k) => ({ value: k, label: HEALTH[k].label, count: rows.filter((r) => r.health === k).length })),
      companies: countBy(rows, (r) => (r.company ? [r.company.id] : [])).map((o) => ({ ...o, label: companies.get(o.value) ?? "" })),
      people: countBy(rows, (r) => [...new Set([...(r.owner ? [r.owner.id] : []), ...r.team.map((u) => u.id)])]).map((o) => ({ ...o, label: people.get(o.value) ?? "" })),
      deadline: (Object.keys(DEADLINE) as Deadline[]).map((k) => ({ value: k, label: DEADLINE[k], count: rows.filter((r) => matchesDeadline(r, k, today)).length })),
    };
  }, [rows, today]);

  const opts = useMemo(
    () => ({
      // Senza un ordinamento scelto restano nell'ordine del server: prima attivi e a rischio
      initial: "",
      text: (r: ProjectRow) => `${r.name} ${r.company?.name ?? ""}`,
      keys: {
        name: (r: ProjectRow) => r.name,
        company: (r: ProjectRow) => r.company?.name ?? null,
        status: (r: ProjectRow) => STATUS_ORDER.indexOf(r.status),
        health: (r: ProjectRow) => HEALTH_ORDER[r.health],
        progress: (r: ProjectRow) => pct(r),
        overdue: (r: ProjectRow) => r.overdue,
        next: (r: ProjectRow) => r.nextDue,
        due: (r: ProjectRow) => r.dueOn,
      },
    }),
    [],
  );
  const t = useSortedRows(filtered, opts);
  const active = [health, company, person, deadline].filter(Boolean).length;

  const setLayout = (l: ProjectsLayout) => {
    const p = new URLSearchParams(params.toString());
    if (l === "lista") p.set("formato", "lista");
    else p.delete("formato");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col">
      <ViewTabs
        options={[
          { value: null, label: "Tutti", count: rows.length },
          ...STATUS_ORDER.filter((k) => rows.some((r) => r.status === k)).map((k) => ({
            value: k,
            label: PROJECT_STATUS[k],
            count: rows.filter((r) => r.status === k).length,
          })),
        ]}
        value={status}
        onChange={setStatus}
      />
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 md:px-6">
        <TableSearch value={t.query} onChange={t.setQuery} placeholder="Cerca progetto o cliente" />
        <FilterSelect label="Salute" value={health} onChange={setHealth} options={options.health} />
        <FilterSelect label="Cliente" value={company} onChange={setCompany} options={options.companies} />
        <FilterSelect label="Persona" value={person} onChange={setPerson} options={options.people} />
        <FilterSelect label="Scadenze" value={deadline} onChange={setDeadline} options={options.deadline} />
        {active ? (
          <button
            type="button"
            onClick={() => [setHealth, setCompany, setPerson, setDeadline].forEach((f) => f(""))}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
            Azzera filtri
          </button>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{t.rows.length} progetti</span>
        <div className="flex rounded-lg bg-secondary p-0.5" role="group" aria-label="Come mostrare i progetti">
          {(
            [
              { v: "schede", label: "Schede", icon: LayoutGrid },
              { v: "lista", label: "Lista", icon: List },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setLayout(o.v)}
              aria-pressed={layout === o.v}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium",
                layout === o.v ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <o.icon className="size-3.5" aria-hidden />
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {t.rows.length === 0 ? (
        <div className="p-4 md:p-6">
          <EmptyState>{rows.length ? "Nessun progetto con questi filtri." : emptyText}</EmptyState>
        </div>
      ) : layout === "lista" ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-[13px]">
            <thead>
              <tr>
                <SortHeader label="Progetto" sortKey="name" sort={t.sort} onToggle={t.toggle} />
                <SortHeader label="Cliente" sortKey="company" sort={t.sort} onToggle={t.toggle} />
                <SortHeader label="Stato" sortKey="status" sort={t.sort} onToggle={t.toggle} />
                <SortHeader label="Salute" sortKey="health" sort={t.sort} onToggle={t.toggle} />
                <SortHeader label="Avanzamento" sortKey="progress" sort={t.sort} onToggle={t.toggle} />
                <SortHeader label="In ritardo" sortKey="overdue" sort={t.sort} onToggle={t.toggle} />
                <SortHeader label="Prossima scadenza" sortKey="next" sort={t.sort} onToggle={t.toggle} />
                <SortHeader label="Consegna" sortKey="due" sort={t.sort} onToggle={t.toggle} />
                <th className="h-9 border-b px-3 text-left text-xs font-medium text-muted-foreground">Team</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r) => (
                <tr key={r.id} className="h-11 border-b hover:bg-muted [&>td]:px-3 [&>td:first-child]:pl-4 md:[&>td:first-child]:pl-6">
                  <td className="max-w-[280px]">
                    <Link href={`/progetti/${r.id}`} className="flex items-center gap-2.5">
                      <CompanyLogo name={r.company?.name ?? r.name} />
                      <span className="truncate font-medium hover:underline">{r.name}</span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">
                    {r.company ? (
                      <Link href={`/companies/${r.company.id}`} className="hover:underline">
                        {r.company.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">{PROJECT_STATUS[r.status]}</td>
                  <td>
                    <HealthChip value={r.health} />
                  </td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${pct(r)}%` }} />
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {r.done}/{r.total}
                      </span>
                    </span>
                  </td>
                  <td className={cn("tabular-nums", r.overdue ? "font-medium text-bad" : "text-muted-foreground")}>{r.overdue || "—"}</td>
                  <td className={cn("whitespace-nowrap tabular-nums", r.nextDue && r.nextDue < today ? "text-bad" : "text-muted-foreground")}>
                    {r.nextDue ? relativeDay(r.nextDue, today) : "—"}
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground tabular-nums">{r.dueOn ? formatDate(r.dueOn) : "—"}</td>
                  <td>
                    <span className="flex items-center gap-1.5">
                      {r.owner ? <UserAvatar initials={r.owner.initials} name={`Owner: ${r.owner.name}`} /> : null}
                      <AvatarStack users={r.team.filter((u) => u.id !== r.owner?.id)} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 md:p-6 2xl:grid-cols-3">
          {t.rows.map((r) => (
            <Link key={r.id} href={`/progetti/${r.id}`} className="flex min-w-0 flex-col gap-3 rounded-[10px] border bg-card p-4 hover:bg-muted/30">
              <div className="flex items-start gap-3">
                <CompanyLogo name={r.company?.name ?? r.name} className="size-8 text-sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{r.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {r.company?.name} · {PROJECT_STATUS[r.status]}
                  </span>
                </div>
                <HealthChip value={r.health} />
              </div>
              {r.healthNote ? <p className="text-xs text-muted-foreground">{r.healthNote}</p> : null}
              <div className="flex flex-col gap-1.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground/70" style={{ width: `${pct(r)}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {r.done} di {r.total} task fatti{r.overdue ? ` · ${r.overdue} in ritardo` : ""}
                  </span>
                  <span>{r.nextDue ? `prossima scadenza ${relativeDay(r.nextDue, today)}` : ""}</span>
                </div>
              </div>
              <AvatarStack users={r.team} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
