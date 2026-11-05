"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeChip, StrengthBar, UserAvatar } from "./chips";
import { BulkOwnerBar, ownerOptions, SelectCell, SelectHeader, useSelection } from "./bulk-actions";
import { countBy, FilterSelect, SortHeader, TableSearch, useSortedRows, ViewTabs } from "./sortable";
import { assignOwner, inheritCompanyOwner } from "@/server/mutations";
import { initialsOf, relativeDay } from "@/lib/format";
import { todayInRome } from "@/lib/followup/dates";
import { MODE, STRENGTH } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type PersonRow = {
  id: string;
  name: string;
  company: { id: string; name: string } | null;
  position: string | null;
  mode: keyof typeof MODE | null;
  nextFollowupOn: string | null;
  lastInteractionAt: string | null;
  strength: keyof typeof STRENGTH;
  owner: { id: string; initials: string; name: string } | null;
  country: string | null;
};

const persone = (n: number) => (n === 1 ? "1 persona" : `${n} persone`);

export function PeopleTable({ rows, today = todayInRome(), showOwnerFilter = true }: { rows: PersonRow[]; today?: string; showOwnerFilter?: boolean }) {
  const [mode, setMode] = useState<keyof typeof MODE | null>(null);
  const [owner, setOwner] = useState("");
  const [country, setCountry] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!mode || r.mode === mode) &&
          (!owner || (owner === "none" ? !r.owner : r.owner?.id === owner)) &&
          (!country || r.country === country),
      ),
    [rows, mode, owner, country],
  );
  const filterOptions = useMemo(
    () => ({
      owners: ownerOptions(rows),
      countries: countBy(rows, (r) => (r.country ? [r.country] : [])).map((o) => ({ ...o, label: o.value })),
    }),
    [rows],
  );
  const opts = useMemo(
    () => ({
      initial: "next",
      text: (r: PersonRow) => `${r.name} ${r.company?.name ?? ""} ${r.position ?? ""}`,
      keys: {
        name: (r: PersonRow) => r.name,
        company: (r: PersonRow) => r.company?.name ?? null,
        mode: (r: PersonRow) => (r.mode ? MODE[r.mode].label : null),
        next: (r: PersonRow) => r.nextFollowupOn,
        last: (r: PersonRow) => r.lastInteractionAt,
        strength: (r: PersonRow) => STRENGTH[r.strength].level,
      },
    }),
    [],
  );
  const t = useSortedRows(filtered, opts);
  const sel = useSelection(t.rows);
  const [pending, start] = useTransition();
  const assign = (ownerId: string | null) =>
    start(async () => {
      const res = await assignOwner({ entity: "person", ids: sel.ids, ownerId });
      if (!res.ok) return void toast.error(res.error);
      toast.success(ownerId ? `Owner assegnato a ${persone(res.data.updated)}` : `Owner tolto da ${persone(res.data.updated)}`);
      sel.clear();
    });
  const inherit = () =>
    start(async () => {
      const res = await inheritCompanyOwner(sel.ids);
      if (!res.ok) return void toast.error(res.error);
      const skipped = sel.ids.length - res.data.updated;
      toast.success(
        `Owner dell'azienda dato a ${persone(res.data.updated)}` + (skipped ? `; ${skipped} senza azienda o con azienda senza owner` : ""),
      );
      sel.clear();
    });

  return (
    <div className="flex flex-col">
      <ViewTabs
        options={[
          { value: null, label: "Tutte", count: rows.length },
          ...(Object.keys(MODE) as (keyof typeof MODE)[]).map((k) => ({
            value: k,
            label: MODE[k].label === "Nessuno" ? "Senza follow-up" : MODE[k].label === "Caldo" ? "Caldi" : "Freddi",
            count: rows.filter((r) => r.mode === k).length,
          })),
        ]}
        value={mode}
        onChange={setMode}
      />
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 md:px-6">
        <TableSearch value={t.query} onChange={t.setQuery} placeholder="Cerca per nome, azienda, ruolo" />
        {showOwnerFilter ? <FilterSelect label="Owner" value={owner} onChange={setOwner} options={filterOptions.owners} /> : null}
        <FilterSelect label="Nazione" value={country} onChange={setCountry} options={filterOptions.countries} />
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{t.rows.length} persone</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-[13px]">
          <thead>
            <tr>
              <SelectHeader state={sel.headerState} onToggle={sel.toggleAll} />
              <SortHeader label="Nome" sortKey="name" sort={t.sort} onToggle={t.toggle} />
              <SortHeader label="Azienda" sortKey="company" sort={t.sort} onToggle={t.toggle} />
              <SortHeader label="Modalità" sortKey="mode" sort={t.sort} onToggle={t.toggle} />
              <SortHeader label="Prossimo follow-up" sortKey="next" sort={t.sort} onToggle={t.toggle} />
              <SortHeader label="Ultimo contatto" sortKey="last" sort={t.sort} onToggle={t.toggle} />
              <SortHeader label="Forza" sortKey="strength" sort={t.sort} onToggle={t.toggle} />
              <th className="px-3 text-left text-xs font-medium text-muted-foreground">Owner</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => {
              const due = r.nextFollowupOn && r.nextFollowupOn <= today;
              return (
                <tr
                  key={r.id}
                  data-selected={sel.has(r.id)}
                  className="h-11 border-b hover:bg-muted data-[selected=true]:bg-muted [&>td]:px-3 [&>td:first-child]:pl-4 md:[&>td:first-child]:pl-6"
                >
                  <SelectCell checked={sel.has(r.id)} onToggle={() => sel.toggle(r.id)} label={r.name} />
                  <td>
                    <Link href={`/people/${r.id}`} className="flex items-center gap-2.5">
                      <UserAvatar initials={initialsOf(r.name)} />
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate font-medium hover:underline">{r.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{r.position}</span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    {r.company ? (
                      <Link href={`/companies/${r.company.id}`} className="hover:underline">
                        {r.company.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <ModeChip mode={r.mode} />
                  </td>
                  <td className={cn("whitespace-nowrap tabular-nums", due ? "font-medium text-bad" : "text-muted-foreground")}>
                    {r.nextFollowupOn ? relativeDay(r.nextFollowupOn, today) : "—"}
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground tabular-nums">{relativeDay(r.lastInteractionAt, today)}</td>
                  <td>
                    <StrengthBar value={r.strength} showLabel />
                  </td>
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
              );
            })}
          </tbody>
        </table>
      </div>
      <BulkOwnerBar count={sel.ids.length} pending={pending} onAssign={assign} onClear={sel.clear}>
        <Button size="sm" variant="outline" disabled={pending} onClick={inherit}>
          <Building2 aria-hidden />
          Owner dell&apos;azienda
        </Button>
      </BulkOwnerBar>
    </div>
  );
}
