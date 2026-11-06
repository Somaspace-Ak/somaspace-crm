import Link from "next/link";
import { cn } from "@/lib/utils";

export type Scope = "mine" | "team";

/**
 * Legge `?vista=` dall'indirizzo. Ogni pagina ha la sua vista di partenza:
 * Oggi e Task partono dai miei, i registri da tutto il team.
 */
export function parseScope(vista: string | string[] | undefined, fallback: Scope): Scope {
  return vista === "team" ? "team" : vista === "miei" ? "mine" : fallback;
}

/** Scelta tra i miei record e quelli di tutto il team, uguale in ogni pagina. */
export function ScopeToggle({
  path,
  value,
  fallback,
  mine = "Miei",
  team = "Tutto il team",
}: {
  path: string;
  value: Scope;
  /** La vista di partenza della pagina: il suo link resta senza parametro */
  fallback: Scope;
  mine?: string;
  team?: string;
}) {
  // `path` può avere già altri parametri (es. il mese del calendario)
  const href = (s: Scope) => (s === fallback ? path : `${path}${path.includes("?") ? "&" : "?"}vista=${s === "mine" ? "miei" : "team"}`);
  return (
    <div className="flex rounded-lg bg-secondary p-0.5 text-[12px]" role="group" aria-label="Di chi sono i record">
      {(
        [
          { v: "mine", label: mine },
          { v: "team", label: team },
        ] as const
      ).map((o) => (
        <Link
          key={o.v}
          href={href(o.v)}
          aria-current={value === o.v ? "true" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium whitespace-nowrap",
            value === o.v ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
