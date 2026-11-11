import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Chip, StageChip } from "@/components/crm/chips";
import { NewMovementButton } from "@/components/crm/finance-dialogs";
import { money, Tile } from "@/components/crm/finance-ui";
import { EmptyState, PageHeader, PageSkeleton, Section } from "@/components/crm/page-header";
import { daysBetween, todayInRome } from "@/lib/followup/dates";
import { formatDate } from "@/lib/format";
import { canSeeFinance, getContracts } from "@/server/finance";
import { getViewer } from "@/server/session";

export const metadata = { title: "Contratti" };

export default function ContractsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Contracts />
    </Suspense>
  );
}

async function Contracts() {
  const { viewer } = await getViewer();
  if (!canSeeFinance(viewer)) notFound();
  const { signed, open } = await getContracts();
  const today = todayInRome();
  // In corso: c'è ancora qualcosa da incassare o da pianificare
  const running = signed.filter((c) => c.planned - c.paid > 0.5 || c.toPlan > 0.5);
  const done = signed.filter((c) => !(c.planned - c.paid > 0.5 || c.toPlan > 0.5));
  const toCollectOf = (c: (typeof signed)[number]) => c.planned + c.toPlan - c.paid;
  const toCollect = running.reduce((s, c) => s + toCollectOf(c), 0);
  const quoted = open.filter((r) => r.o.stage === "in_progress");
  const leads = open.filter((r) => r.o.stage === "lead");

  return (
    <>
      <PageHeader
        title="Contratti"
        description="I contratti firmati e quanto resta da incassare; le trattative aperte, il guadagno potenziale"
        actions={<NewMovementButton variant="default" label="Nuovo incasso" defaults={{ direction: "entrata", category: "contratto" }} />}
      />
      <div className="flex max-w-6xl flex-col gap-8 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Da incassare dai firmati" value={money(toCollect)} hint={`${running.length} contratti in corso`} tone="ok" />
          <Tile label="Da pianificare" value={money(running.reduce((s, c) => s + c.toPlan, 0))} hint="valore senza date di incasso" />
          <Tile label="Preventivi inviati" value={money(quoted.reduce((s, r) => s + (r.o.initialValue ?? 0), 0))} hint={`${quoted.length} in trattativa`} />
          <Tile label="Lead" value={money(leads.reduce((s, r) => s + (r.o.initialValue ?? 0), 0))} hint={`${leads.length} da quotare`} />
        </div>

        <Section title="Firmati, in corso" count={running.length}>
          {running.length ? (
            <div className="overflow-x-auto rounded-[10px] border bg-card">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted text-left text-xs text-muted-foreground">
                    <th className="px-3.5 py-2 font-medium">Contratto</th>
                    <th className="px-3 py-2 text-right font-medium">Valore</th>
                    <th className="px-3 py-2 text-right font-medium">Incassato</th>
                    <th className="px-3 py-2 text-right font-medium">Da incassare</th>
                    <th className="px-3 py-2 font-medium">Prossimo incasso</th>
                    <th className="px-3.5 py-2" />
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {running.map((c) => {
                    const fresh = c.closedOn && daysBetween(c.closedOn, today) <= 30;
                    const pct = c.value ? Math.min(100, Math.round((c.paid / c.value) * 100)) : 0;
                    return (
                      <tr key={c.key} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <Link
                              href={c.opportunityId ? `/pipeline/${c.opportunityId}` : c.company ? `/finanza/movimenti?azienda=${c.company.id}&stato=tutte` : "/finanza/movimenti"}
                              className="font-medium hover:underline"
                            >
                              {c.name}
                            </Link>
                            {fresh ? <Chip tone="brand">Nuovo</Chip> : null}
                            {c.opportunityId ? null : <Chip tone="neutral">fuori pipeline</Chip>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {c.company ? (
                              <Link href={`/companies/${c.company.id}`} className="hover:underline">
                                {c.company.name}
                              </Link>
                            ) : (
                              c.counterparty
                            )}
                            {c.project ? (
                              <>
                                {" · "}
                                <Link href={`/progetti/${c.project.id}`} className="hover:underline">
                                  {c.project.name}
                                </Link>
                              </>
                            ) : null}
                            {c.closedOn ? ` · firmato ${formatDate(c.closedOn)}` : null}
                          </div>
                          <div className="mt-1.5 h-1 w-40 overflow-hidden rounded-full bg-muted" aria-label={`Incassato il ${pct}%`}>
                            <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">{money(c.value)}</td>
                        <td className="px-3 py-2.5 text-right text-ok">{money(c.paid)}</td>
                        <td className="px-3 py-2.5 text-right font-medium">{money(toCollectOf(c))}</td>
                        <td className="px-3 py-2.5 text-[13px]">
                          {c.nextDue ? formatDate(c.nextDue) : <span className="text-muted-foreground">—</span>}
                          {c.toPlan > 0.5 ? <div className="text-xs text-warn">{money(c.toPlan)} senza data</div> : null}
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <NewMovementButton
                            label={c.toPlan > 0.5 ? "Pianifica" : "Rata"}
                            variant="ghost"
                            defaults={{
                              direction: "entrata",
                              category: "contratto",
                              title: c.name,
                              amount: c.toPlan > 0.5 ? c.toPlan : undefined,
                              companyId: c.company?.id,
                              counterparty: c.counterparty,
                              projectId: c.project?.id,
                              opportunityId: c.opportunityId,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>Nessun contratto con incassi aperti. Quando un deal passa a Vinta in Pipeline, arriva qui come incasso da pianificare.</EmptyState>
          )}
        </Section>

        <Section title="In trattativa: il potenziale" count={open.length}>
          {open.length ? (
            <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
              {open.map((r) => (
                <li key={r.o.id} className="relative flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 hover:bg-muted/40">
                  <StageChip stage={r.o.stage} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link href={`/pipeline/${r.o.id}`} className="truncate text-sm font-medium after:absolute after:inset-0">
                      {r.o.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {r.company.name}
                      {r.o.quoteSentOn ? ` · preventivo del ${formatDate(r.o.quoteSentOn)}` : null}
                    </span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{money(r.o.initialValue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Nessuna trattativa aperta in Pipeline.</EmptyState>
          )}
        </Section>

        {done.length ? (
          <Section title="Firmati e incassati" count={done.length}>
            <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
              {done.map((c) => (
                <li key={c.key} className="flex flex-wrap items-center gap-x-3 px-3.5 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {c.opportunityId ? (
                      <Link href={`/pipeline/${c.opportunityId}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{c.name}</span>
                    )}
                    <span className="text-muted-foreground"> · {c.company?.name ?? c.counterparty}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.historic ? "prima della Finanza · " : null}
                    {c.closedOn ? formatDate(c.closedOn) : null}
                  </span>
                  <span className="tabular-nums">{money(c.value)}</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </>
  );
}
