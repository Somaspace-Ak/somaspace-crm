import { cn } from "@/lib/utils";

export function formatRate(rate: number | null) {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

/** Barra della conversione: quota arrivata a un'opportunità (chiara) e quota diventata cliente (piena). */
export function ConversionBar({ met, opportunity, clients, className }: { met: number; opportunity: number; clients: number; className?: string }) {
  const pct = (n: number) => (met ? `${(n / met) * 100}%` : "0%");
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      <div className="absolute inset-y-0 left-0 rounded-full bg-brand/35" style={{ width: pct(opportunity) }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-ok" style={{ width: pct(clients) }} />
    </div>
  );
}

/** Quattro numeri in fila: incontrate, opportunità, clienti, conversione. */
export function ConversionStats({ met, opportunity, clients, rate, extra }: { met: number; opportunity: number; clients: number; rate: number | null; extra?: { label: string; value: string } }) {
  const items = [
    ...(extra ? [extra] : []),
    { label: "Persone incontrate", value: String(met) },
    { label: "Arrivate a un'opportunità", value: String(opportunity) },
    { label: "Diventate clienti", value: String(clients) },
    { label: "Conversione", value: formatRate(rate) },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-[10px] border bg-card sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-1 border-b px-4 py-3 sm:border-r sm:border-b-0 sm:last:border-r-0">
          <dt className="label-mono">{it.label}</dt>
          <dd className="text-2xl font-semibold tracking-[-0.02em] tabular-nums">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
