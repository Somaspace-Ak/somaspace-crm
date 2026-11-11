import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NewMovementButton } from "@/components/crm/finance-dialogs";
import { categoryLabel, money, Tile } from "@/components/crm/finance-ui";
import { EmptyState, PageHeader, PageSkeleton, Section } from "@/components/crm/page-header";
import { todayInRome } from "@/lib/followup/dates";
import { formatDate } from "@/lib/format";
import type { CASH_CATEGORY } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { canSeeFinance, getSuppliers } from "@/server/finance";
import { getViewer } from "@/server/session";

export const metadata = { title: "Fornitori" };

export default function SuppliersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Suppliers />
    </Suspense>
  );
}

async function Suppliers() {
  const { viewer } = await getViewer();
  if (!canSeeFinance(viewer)) notFound();
  const rows = await getSuppliers();
  const today = todayInRome();
  const due = rows.reduce((s, r) => s + r.due, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);

  return (
    <>
      <PageHeader
        title="Fornitori"
        description="A chi paghiamo: collaboratori, fornitori, tasse e servizi"
        actions={<NewMovementButton variant="default" label="Nuova uscita" defaults={{ direction: "uscita", category: "fornitori" }} />}
      />
      <div className="flex max-w-5xl flex-col gap-8 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Tile label="Da pagare" value={money(due)} hint={`${rows.filter((r) => r.due > 0).length} fornitori`} />
          <Tile label="Pagato" value={money(paid)} hint="registrato nel CRM" />
        </div>
        <Section title="Tutti" count={rows.length}>
          {rows.length ? (
            <div className="overflow-x-auto rounded-[10px] border bg-card">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted text-left text-xs text-muted-foreground">
                    <th className="px-3.5 py-2 font-medium">Fornitore</th>
                    <th className="px-3 py-2 font-medium">Per</th>
                    <th className="px-3 py-2 text-right font-medium">Da pagare</th>
                    <th className="px-3 py-2 font-medium">Prossima scadenza</th>
                    <th className="px-3.5 py-2 text-right font-medium">Pagato</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((r) => {
                    const list = r.company
                      ? `/finanza/movimenti?azienda=${r.company.id}&stato=tutte`
                      : r.counterparty
                        ? `/finanza/movimenti?controparte=${encodeURIComponent(r.counterparty)}&stato=tutte`
                        : `/finanza/movimenti?stato=tutte&categoria=${r.category}`;
                    return (
                      <tr key={r.key} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3.5 py-2.5">
                          <Link href={list} className="font-medium hover:underline">
                            {r.name}
                          </Link>
                          {r.company ? (
                            <Link href={`/companies/${r.company.id}`} className="ml-2 text-xs text-muted-foreground hover:underline">
                              scheda
                            </Link>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] text-muted-foreground">
                          {r.categories.map((c) => categoryLabel(c as keyof typeof CASH_CATEGORY)).join(", ") || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium">{r.due ? money(r.due) : <span className="text-muted-foreground/50">—</span>}</td>
                        <td className={cn("px-3 py-2.5 text-[13px]", r.nextDue && r.nextDue < today && "font-medium text-bad")}>
                          {r.nextDue ? formatDate(r.nextDue) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-muted-foreground">{r.paid ? money(r.paid) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>Nessun fornitore. Arrivano dalle uscite, o dalle aziende del CRM con relazione Fornitore.</EmptyState>
          )}
          <p className="text-xs text-muted-foreground">
            Un fornitore che ricorre conviene crearlo come azienda del CRM, con relazione Fornitore: così le uscite si legano alla sua scheda.
          </p>
        </Section>
      </div>
    </>
  );
}
