import { SidebarTrigger } from "@/components/ui/sidebar";
import { HeaderSearch } from "./header-tools";

/** Intestazione di pagina: titolo, dettaglio accanto in grigio, ricerca e azioni a destra. */
export function PageHeader({
  title,
  description,
  actions,
  icon,
  breadcrumb,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur md:px-6">
      <SidebarTrigger className="-ml-1 md:hidden" />
      {icon}
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        {breadcrumb ?? <h1 className="truncate text-xl leading-7 font-semibold tracking-[-0.01em]">{title}</h1>}
        {description ? <p className="hidden truncate text-[13px] text-muted-foreground sm:block">{description}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <HeaderSearch />
        {actions}
      </div>
    </header>
  );
}

/** Intestazione di sezione dentro una card, come nella coda di Oggi. */
export function SectionBar({ icon, title, count, extra }: { icon?: React.ReactNode; title: string; count?: number; extra?: React.ReactNode }) {
  return (
    <div className="flex h-11 items-center gap-2 border-b bg-muted px-4">
      {icon}
      <h3 className="text-sm font-semibold">{title}</h3>
      {count !== undefined ? (
        <span className="inline-flex h-[18px] min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-semibold tabular-nums">{count}</span>
      ) : null}
      {extra ? <div className="ml-auto flex items-center gap-2">{extra}</div> : null}
    </div>
  );
}

export function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined ? (
          <span className="inline-flex h-[18px] min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-semibold tabular-nums">{count}</span>
        ) : null}
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[10px] border border-dashed px-4 py-6 text-center text-[13px] text-muted-foreground">{children}</p>;
}

/** Ripiego mentre i dati arrivano (le pagine leggono sempre dati freschi). */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-6" aria-busy>
      <div className="h-5 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-72 animate-pulse rounded bg-muted" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-muted/70" />
      ))}
    </div>
  );
}
