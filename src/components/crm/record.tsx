import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pannello attributi delle schede: etichetta a sinistra, valore a destra. */
export function Attributes({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("flex flex-col gap-0.5", className)}>{children}</dl>;
}

export function Attribute({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-9 grid-cols-[108px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1 text-[13px]">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export function RecordLayout({ side, children }: { side: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside aria-label="Attributi" className="flex flex-col gap-6 border-b px-3 pt-4 pb-8 lg:border-r lg:border-b-0">
        {side}
      </aside>
      <div className="min-w-0 px-4 pt-0 pb-10 md:px-7">{children}</div>
    </div>
  );
}

export function SideBlock({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 pb-1">
        <h3 className="label-mono">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Percorso nell'intestazione: Aziende › Nome. */
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Percorso" className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 ? <ChevronRight className="size-3 shrink-0" aria-hidden /> : null}
          {it.href ? (
            <Link href={it.href} className="hover:text-foreground">
              {it.label}
            </Link>
          ) : (
            <span className="truncate font-medium text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Testata del record: avatar grande, nome, chip di stato e azioni. */
export function RecordHero({
  avatar,
  title,
  subtitle,
  chips,
  actions,
}: {
  avatar: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-b px-4 pt-6 pb-5 md:px-6">
      {avatar}
      <div className="flex min-w-[240px] flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em]">{title}</h1>
          {subtitle ? <span className="text-[13px] text-muted-foreground">{subtitle}</span> : null}
        </div>
        {chips ? <div className="flex flex-wrap items-center gap-1.5">{chips}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Banner dell'agente sopra la scheda, quando c'è qualcosa da verificare. */
export function AgentBanner({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-brand-border bg-brand-bg px-4 py-2.5 md:px-6">
      <Sparkles className="size-4 text-brand" aria-hidden />
      <span className="text-[13px]">{children}</span>
      {actions ? <div className="ml-auto flex gap-1.5">{actions}</div> : null}
    </div>
  );
}

/** Classi per le schede sottolineate (Panoramica, Persone, Timeline...). */
export const lineTabsList = "mb-6 h-10 w-full justify-start gap-5 overflow-x-auto overflow-y-hidden rounded-none border-b p-0";
export const lineTab = "h-10 flex-none px-0 text-[13px] text-muted-foreground data-active:text-foreground";
