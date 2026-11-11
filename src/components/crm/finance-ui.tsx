import Link from "next/link";
import { cn } from "@/lib/utils";
import { CASH_CATEGORY, CASH_CHECK, CASH_STATUS, type Tone } from "@/lib/labels";
import { Chip } from "./chips";

// "always": anche 7.789 col punto (in italiano di base le migliaia si separano solo da 10.000)
const euro2 = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
const euro0 = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });

/** Euro con i centesimi solo quando ci sono: 1.159 €, 4.910,50 € */
export function money(v: number | null | undefined) {
  if (v == null) return "—";
  return Number.isInteger(Math.round(v * 100) / 100) ? euro0.format(v) : euro2.format(v);
}

/** Un importo con il segno e il colore: verde se entra, normale se esce. */
export function Amount({ value, direction, className }: { value: number; direction: "entrata" | "uscita"; className?: string }) {
  return (
    <span className={cn("tabular-nums whitespace-nowrap", direction === "entrata" && "text-ok", className)}>
      {direction === "entrata" ? "+" : "−"}
      {money(value)}
    </span>
  );
}

export function CashStatusChip({ status, direction }: { status: keyof typeof CASH_STATUS; direction: "entrata" | "uscita" }) {
  const s = CASH_STATUS[status];
  return <Chip tone={s.tone}>{s[direction]}</Chip>;
}

export function CheckChip({ check }: { check: keyof typeof CASH_CHECK }) {
  return <Chip tone={CASH_CHECK[check].tone}>{CASH_CHECK[check].label}</Chip>;
}

export const categoryLabel = (c: keyof typeof CASH_CATEGORY) => CASH_CATEGORY[c].label;

/** Un numero chiave in cima alla pagina. */
export function Tile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[10px] border bg-card px-3.5 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-xl leading-7 font-semibold tracking-[-0.01em] tabular-nums",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "bad" && "text-bad",
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** Scelta tra due o più viste con link, come Miei / Di tutti. */
export function LinkToggle({ options, label }: { options: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <div className="flex rounded-lg bg-secondary p-0.5 text-[12px]" role="group" aria-label={label}>
      {options.map((o) => (
        <Link
          key={o.href + o.label}
          href={o.href}
          aria-current={o.active ? "true" : undefined}
          className={cn("rounded-md px-2.5 py-1 font-medium whitespace-nowrap", o.active ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

/** Chi c'è dall'altra parte: il cliente o fornitore del CRM, il nome scritto, o la persona del team. */
export function Counterparty({
  company,
  counterparty,
  person,
}: {
  company: { id: string; name: string } | null;
  counterparty: string | null;
  person?: { id: string; name: string } | null;
}) {
  if (company?.id)
    return (
      <Link href={`/companies/${company.id}`} className="relative z-10 hover:underline">
        {company.name}
      </Link>
    );
  if (person?.id) return <span>{person.name}</span>;
  return counterparty ? <span>{counterparty}</span> : null;
}
