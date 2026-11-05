"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "./chips";
import { useFormOptions } from "./form-options";

/** Opzioni del filtro Owner: chi ha più record per primo, poi "Senza owner". */
export function ownerOptions(rows: { owner: { id: string; name: string } | null }[]) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    if (!r.owner) continue;
    const c = counts.get(r.owner.id) ?? { label: r.owner.name, count: 0 };
    c.count++;
    counts.set(r.owner.id, c);
  }
  return [
    ...[...counts.entries()].map(([value, c]) => ({ value, ...c })).sort((a, b) => b.count - a.count),
    { value: "none", label: "Senza owner", count: rows.filter((r) => !r.owner).length },
  ];
}

/** Righe selezionate di una tabella. Si agisce solo su quelle visibili con i filtri attuali. */
export function useSelection<T extends { id: string }>(visible: T[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const ids = visible.filter((r) => selected.has(r.id)).map((r) => r.id);
  const all = visible.length > 0 && ids.length === visible.length;
  return {
    ids,
    has: (id: string) => selected.has(id),
    toggle: (id: string) =>
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    /** Seleziona tutte le righe visibili, o le toglie se lo erano già */
    toggleAll: () => setSelected(all ? new Set() : new Set(visible.map((r) => r.id))),
    clear: () => setSelected(new Set()),
    headerState: (all ? true : ids.length ? "indeterminate" : false) as boolean | "indeterminate",
  };
}

export function SelectHeader({ state, onToggle }: { state: boolean | "indeterminate"; onToggle: () => void }) {
  return (
    <th className="h-9 w-10 border-b pr-0 pl-4 align-middle md:pl-6">
      <Checkbox checked={state} onCheckedChange={onToggle} aria-label="Seleziona tutte le righe visibili" />
    </th>
  );
}

export function SelectCell({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <td className="w-10 pr-0">
      <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`Seleziona ${label}`} />
    </td>
  );
}

/** Barra in basso che compare con almeno una riga selezionata: owner in blocco e altre azioni. */
export function BulkOwnerBar({
  count,
  pending,
  onAssign,
  onClear,
  children,
}: {
  count: number;
  pending: boolean;
  onAssign: (ownerId: string | null) => void;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  const { users } = useFormOptions();
  if (!count) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div
        role="toolbar"
        aria-label="Azioni sulle righe selezionate"
        className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 text-[13px] shadow-lg"
      >
        <span className="px-1 font-medium tabular-nums">{count === 1 ? "1 selezionata" : `${count} selezionate`}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={pending}>
              {pending ? "Assegno…" : "Assegna owner"}
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="min-w-52">
            <DropdownMenuLabel>Owner</DropdownMenuLabel>
            {users.map((u) => (
              <DropdownMenuItem key={u.id} onSelect={() => onAssign(u.id)}>
                <UserAvatar initials={u.initials} name={u.name} />
                {u.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAssign(null)} className="text-muted-foreground">
              Togli l&apos;owner
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {children}
        <button
          type="button"
          onClick={onClear}
          aria-label="Deseleziona tutto"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
