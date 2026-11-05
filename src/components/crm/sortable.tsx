"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

/** Ordinamento e ricerca per le tabelle dei record. */
export function useSortedRows<T>(
  rows: T[],
  opts: { initial: string; dir?: SortDir; keys: Record<string, (r: T) => string | number | null>; text: (r: T) => string },
) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: opts.initial, dir: opts.dir ?? "asc" });
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => opts.text(r).toLowerCase().includes(q)) : rows;
    const get = opts.keys[sort.key];
    if (!get) return filtered;
    return [...filtered].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      // I valori vuoti vanno sempre in fondo
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "it");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, query, sort, opts]);

  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return { rows: sorted, sort, toggle, query, setQuery };
}

export function SortHeader({
  label,
  sortKey,
  sort,
  onToggle,
  className,
}: {
  label: string;
  sortKey: string;
  sort: { key: string; dir: SortDir };
  onToggle: (key: string) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("h-9 border-b px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-4 md:first:pl-6", className)}>
      <button type="button" onClick={() => onToggle(sortKey)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {active ? <Icon className="size-3" aria-label={sort.dir === "asc" ? "crescente" : "decrescente"} /> : null}
      </button>
    </th>
  );
}

export function TableSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-8 w-full max-w-64 items-center gap-2 rounded-md border bg-background px-2 text-sm focus-within:ring-2 focus-within:ring-ring/40">
      <Search className="size-3.5 text-muted-foreground" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(value === o.value ? null : o.value)}
          className={cn(
            "h-7 rounded-md border px-2 text-xs",
            value === o.value ? "border-foreground/30 bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Filtro a tendina: il primo valore ("Tutti") non filtra. Evidenziato quando è attivo. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; count?: number }[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 max-w-44 rounded-md border bg-background px-2 text-[13px]",
        value ? "border-foreground/30 font-medium" : "text-muted-foreground",
      )}
    >
      <option value="">{label}: tutti</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
          {o.count != null ? ` (${o.count})` : ""}
        </option>
      ))}
    </select>
  );
}

/** Conteggio dei valori per le opzioni di un filtro, i più frequenti per primi. */
export function countBy<T>(rows: T[], get: (r: T) => string[]): { value: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) for (const v of get(r)) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "it"));
}

/** Viste a schede con conteggio (Tutte, Clienti, Prospect...), sottolineata quella attiva. */
export function ViewTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T | null; label: string; count: number }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b px-4 md:px-6" role="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.label}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-2 text-[13px] font-medium whitespace-nowrap",
              on ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            <span className="text-muted-foreground tabular-nums">{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}
