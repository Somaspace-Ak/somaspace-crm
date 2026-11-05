import Link from "next/link";
import { Suspense } from "react";
import { ConversionBar, ConversionStats, formatRate } from "@/components/crm/event-stats";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { formatDateYear } from "@/lib/format";
import { listEvents } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Eventi" };

export default function EventsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Events />
    </Suspense>
  );
}

async function Events() {
  await getViewer();
  const rows = await listEvents();
  const met = rows.reduce((n, r) => n + r.met, 0);
  const opportunity = rows.reduce((n, r) => n + r.opportunity, 0);
  const clients = rows.reduce((n, r) => n + r.clients, 0);

  return (
    <>
      <PageHeader title="Eventi" description="Eventi e programmi: chi abbiamo incontrato e quanti sono diventati clienti" />
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <ConversionStats
          extra={{ label: "Eventi", value: String(rows.length) }}
          met={met}
          opportunity={opportunity}
          clients={clients}
          rate={met ? clients / met : null}
        />
        {rows.length ? (
          <div className="overflow-x-auto rounded-[10px] border bg-card">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="[&>th]:h-9 [&>th]:border-b [&>th]:px-3 [&>th]:text-left [&>th]:text-xs [&>th]:font-medium [&>th]:whitespace-nowrap [&>th]:text-muted-foreground [&>th:first-child]:pl-4">
                  <th>Evento</th>
                  <th>Data</th>
                  <th>Tipologia</th>
                  <th>Paese</th>
                  <th className="text-right!">Incontrate</th>
                  <th className="text-right!">Opportunità</th>
                  <th className="text-right!">Clienti</th>
                  <th className="w-44">Conversione</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.event.id} className="h-11 border-b last:border-b-0 hover:bg-muted [&>td]:px-3 [&>td:first-child]:pl-4">
                    <td>
                      <Link href={`/eventi/${r.event.id}`} className="font-medium hover:underline">
                        {r.event.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap text-muted-foreground tabular-nums">{r.event.date ? formatDateYear(r.event.date) : "—"}</td>
                    <td className="whitespace-nowrap">{r.event.kind ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="whitespace-nowrap">{r.event.country ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="text-right tabular-nums">{r.met || <span className="text-muted-foreground">0</span>}</td>
                    <td className="text-right tabular-nums">{r.opportunity || <span className="text-muted-foreground">0</span>}</td>
                    <td className="text-right tabular-nums">{r.clients || <span className="text-muted-foreground">0</span>}</td>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <ConversionBar met={r.met} opportunity={r.opportunity} clients={r.clients} className="w-24" />
                        <span className="w-9 text-right tabular-nums">{formatRate(r.rate)}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Nessun evento. Si collegano dalla scheda della persona, nel campo Evento.</EmptyState>
        )}
        <p className="text-xs text-muted-foreground">
          Conversione = persone diventate clienti su persone incontrate. Una persona conta come opportunità se ne ha una lei o la sua azienda.
        </p>
      </div>
    </>
  );
}
