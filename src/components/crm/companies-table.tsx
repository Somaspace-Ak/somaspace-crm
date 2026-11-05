"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AgentMark, CompanyLogo, RelationshipChip, StrengthBar, UserAvatar } from "./chips";
import { cn } from "@/lib/utils";
import { daysBetween, toRomeDate, todayInRome } from "@/lib/followup/dates";
import { BulkOwnerBar, ownerOptions, SelectCell, SelectHeader, useSelection } from "./bulk-actions";
import { countBy, FilterSelect, SortHeader, TableSearch, useSortedRows, ViewTabs } from "./sortable";
import { Checkbox } from "@/components/ui/checkbox";
import { assignOwner } from "@/server/mutations";
import { formatEuro, relativeDay } from "@/lib/format";
import { RELATIONSHIP, STRENGTH } from "@/lib/labels";

export type CompanyRow = {
  id: string;
  name: string;
  domain: string | null;
  categories: string[];
  country: string | null;
  relationship: keyof typeof RELATIONSHIP;
  strength: keyof typeof STRENGTH;
  lastInteractionAt: string | null;
  owner: { id: string; initials: string; name: string } | null;
  people: number;
  activeProjects: number;
  openValue: number | null;
  toVerify: boolean;
};

/** Nessun contatto da più di 90 giorni: la data diventa rossa. */
function isStale(at: string | null) {
  return !at || daysBetween(toRomeDate(at), todayInRome()) > 90;
}

const aziende = (n: number) => (n === 1 ? "1 azienda" : `${n} aziende`);

export function CompaniesTable({ rows, showOwnerFilter = true }: { rows: CompanyRow[]; showOwnerFilter?: boolean }) {
  const [relationship, setRelationship] = useState<keyof typeof RELATIONSHIP | null>(null);
  const [owner, setOwner] = useState("");
  const [country, setCountry] = useState("");
  const [category, setCategory] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!relationship || r.relationship === relationship) &&
          (!owner || (owner === "none" ? !r.owner : r.owner?.id === owner)) &&
          (!country || r.country === country) &&
          (!category || r.categories.includes(category)),
      ),
    [rows, relationship, owner, country, category],
  );
  const filterOptions = useMemo(
    () => ({
      owners: ownerOptions(rows),
      countries: countBy(rows, (r) => (r.country ? [r.country] : [])).map((o) => ({ ...o, label: o.value })),
      categories: countBy(rows, (r) => r.categories).map((o) => ({ ...o, label: o.value })),
    }),
    [rows],
  );
  const opts = useMemo(
    () => ({
      initial: "last",
      dir: "desc" as const,
      text: (r: CompanyRow) => `${r.name} ${r.domain ?? ""} ${r.country ?? ""} ${r.categories.join(" ")}`,
      keys: {
        name: (r: CompanyRow) => r.name,
        country: (r: CompanyRow) => r.country,
        relationship: (r: CompanyRow) => RELATIONSHIP[r.relationship].label,
        strength: (r: CompanyRow) => STRENGTH[r.strength].level,
        last: (r: CompanyRow) => r.lastInteractionAt,
        projects: (r: CompanyRow) => r.activeProjects,
        value: (r: CompanyRow) => r.openValue,
      },
    }),
    [],
  );
  const t = useSortedRows(filtered, opts);
  const sel = useSelection(t.rows);
  const [includePeople, setIncludePeople] = useState(true);
  const [pending, start] = useTransition();
  const assign = (ownerId: string | null) =>
    start(async () => {
      const res = await assignOwner({ entity: "company", ids: sel.ids, ownerId, includePeople });
      if (!res.ok) return void toast.error(res.error);
      const extra = res.data.updated - sel.ids.length;
      toast.success(
        ownerId
          ? `Owner assegnato a ${aziende(sel.ids.length)}${extra > 0 ? ` e ${extra === 1 ? "1 persona" : `${extra} persone`}` : ""}`
          : `Owner tolto da ${aziende(sel.ids.length)}`,
      );
      sel.clear();
    });

  return (
    <div className="flex flex-col">
      <ViewTabs
        options={[
          { value: null, label: "Tutte", count: rows.length },
          ...(Object.keys(RELATIONSHIP) as (keyof typeof RELATIONSHIP)[])
            .filter((k) => rows.some((r) => r.relationship === k))
            .map((k) => ({ value: k, label: RELATIONSHIP[k].label === "Cliente" ? "Clienti" : RELATIONSHIP[k].label, count: rows.filter((r) => r.relationship === k).length })),
        ]}
        value={relationship}
        onChange={setRelationship}
      />
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 md:px-6">
        <TableSearch value={t.query} onChange={t.setQuery} placeholder="Cerca per nome, dominio, paese" />
        {showOwnerFilter ? <FilterSelect label="Owner" value={owner} onChange={setOwner} options={filterOptions.owners} /> : null}
        <FilterSelect label="Nazione" value={country} onChange={setCountry} options={filterOptions.countries} />
        <FilterSelect label="Categoria" value={category} onChange={setCategory} options={filterOptions.categories} />
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{t.rows.length} aziende</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-[13px]">
          <thead>
            <tr>
              <SelectHeader state={sel.headerState} onToggle={sel.toggleAll} />
              <SortHeader label="Nome" sortKey="name" sort={t.sort} onToggle={t.toggle} />
              <th className="px-3 text-left text-xs font-medium text-muted-foreground">Categoria</th>
              <SortHeader label="Nazione" sortKey="country" sort={t.sort} onToggle={t.toggle} />
              <SortHeader label="Relazione" sortKey="relationship" sort={t.sort} onToggle={t.toggle} />
              <SortHeader label="Forza" sortKey="strength" sort={t.sort} onToggle={t.toggle} />
              <SortHeader label="Ultimo contatto" sortKey="last" sort={t.sort} onToggle={t.toggle} />
              <SortHeader label="Progetti" sortKey="projects" sort={t.sort} onToggle={t.toggle} />
              <SortHeader label="Deal aperti" sortKey="value" sort={t.sort} onToggle={t.toggle} />
              <th className="px-3 text-left text-xs font-medium text-muted-foreground">Owner</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr
                key={r.id}
                data-selected={sel.has(r.id)}
                className="h-10 border-b hover:bg-muted data-[selected=true]:bg-muted [&>td]:px-3 [&>td:first-child]:pl-4 md:[&>td:first-child]:pl-6"
              >
                <SelectCell checked={sel.has(r.id)} onToggle={() => sel.toggle(r.id)} label={r.name} />
                <td>
                  <Link href={`/companies/${r.id}`} className="flex items-center gap-2.5">
                    <CompanyLogo name={r.name} />
                    <span className="truncate font-medium hover:underline">{r.name}</span>
                    {r.toVerify ? <AgentMark label="Da verificare" /> : null}
                  </Link>
                </td>
                <td className="whitespace-nowrap">{r.categories.join(", ") || <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap">{r.country ?? "—"}</td>
                <td>
                  <RelationshipChip value={r.relationship} />
                </td>
                <td>
                  <StrengthBar value={r.strength} showLabel />
                </td>
                <td className={cn("whitespace-nowrap tabular-nums", isStale(r.lastInteractionAt) && "text-bad")}>{relativeDay(r.lastInteractionAt)}</td>
                <td className="tabular-nums">{r.activeProjects || <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap tabular-nums">{r.openValue ? formatEuro(r.openValue) : <span className="text-muted-foreground">—</span>}</td>
                <td>
                  {r.owner ? (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <UserAvatar initials={r.owner.initials} name={r.owner.name} />
                      {r.owner.name.split(" ")[0]}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BulkOwnerBar count={sel.ids.length} pending={pending} onAssign={assign} onClear={sel.clear}>
        <label className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <Checkbox checked={includePeople} onCheckedChange={(v) => setIncludePeople(v === true)} />
          anche alle loro persone senza owner
        </label>
      </BulkOwnerBar>
    </div>
  );
}
