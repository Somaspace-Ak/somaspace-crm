import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, CalendarClock, FileSignature, TrendingUp } from "lucide-react";
import { Chip } from "@/components/crm/chips";
import { BalanceButton, MarkPaidButton, NewMovementButton } from "@/components/crm/finance-dialogs";
import { Amount, CheckChip, Counterparty, LinkToggle, money, Tile } from "@/components/crm/finance-ui";
import { EmptyState, PageHeader, PageSkeleton, Section } from "@/components/crm/page-header";
import { daysBetween } from "@/lib/followup/dates";
import { monthEnd, type ForecastRow, type Scenario } from "@/lib/finance/forecast";
import { formatDate, formatLongDate, relativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { canSeeFinance, getFinanceOverview } from "@/server/finance";
import { getViewer } from "@/server/session";

export const metadata = { title: "Previsionale" };

export default function ForecastPage(props: PageProps<"/finanza">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Forecast {...props} />
    </Suspense>
  );
}

async function Forecast({ searchParams }: PageProps<"/finanza">) {
  const { viewer } = await getViewer();
  if (!canSeeFinance(viewer)) notFound();
  const sp = await searchParams;
  const scenario: Scenario = sp.scenario === "prudente" ? "prudente" : "firmati";
  const months = typeof sp.mesi === "string" && /^\d{1,2}$/.test(sp.mesi) ? Math.min(24, Math.max(1, Number(sp.mesi))) : undefined;
  const data = await getFinanceOverview({ scenario, months });
  const { forecast: f, balance, settings } = data;
  const last = f.months.at(-1)!;
  const href = (p: { scenario?: Scenario; mesi?: number }) => {
    const q = new URLSearchParams();
    const sc = p.scenario ?? scenario;
    const m = p.mesi ?? months;
    if (sc === "prudente") q.set("scenario", "prudente");
    if (m) q.set("mesi", String(m));
    const s = q.toString();
    return s ? `/finanza?${s}` : "/finanza";
  };
  const balanceAge = balance ? daysBetween(balance.on, data.today) : null;
  const atRisk = [...f.income, ...f.expenses].filter((r) => r.atRisk);

  return (
    <>
      <PageHeader
        title="Previsionale"
        description="La cassa mese per mese, dal saldo della banca"
        actions={
          <>
            <LinkToggle
              label="Scenario"
              options={[
                { href: href({ scenario: "firmati" }), label: "Contratti firmati", active: scenario === "firmati" },
                { href: href({ scenario: "prudente" }), label: "Prudente", active: scenario === "prudente" },
              ]}
            />
            <LinkToggle
              label="Mesi"
              options={[4, 6, 12].map((m) => ({ href: href({ mesi: m }), label: `${m} mesi`, active: settings.months === m }))}
            />
            <BalanceButton />
            <NewMovementButton variant="default" />
          </>
        }
      />
      <div className="flex max-w-6xl flex-col gap-8 p-4 md:p-6">
        {!balance ? (
          <p className="rounded-[10px] border border-brand/30 bg-brand-bg p-3 text-[13px]">
            Per partire serve il saldo della banca di oggi: premi <span className="font-medium">Aggiorna saldo</span>. Il previsionale parte da lì.
          </p>
        ) : balanceAge! > 10 ? (
          <p className="rounded-[10px] border border-warn/30 bg-warn-bg p-3 text-[13px]">
            Il saldo è del {formatLongDate(balance.on)}, {balanceAge} giorni fa. Aggiornalo e segna pagate le voci passate dalla banca: i conti tornano solo così.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile label="Saldo banca" value={money(f.startCash)} hint={balance ? `al ${formatDate(balance.on)}` : "da inserire"} />
          <Tile label="Incassi previsti" value={money(f.totals.income)} hint={`fino a ${last.label.toLowerCase()}`} tone="ok" />
          <Tile label="Uscite e compensi" value={money(f.totals.expenses + f.totals.pay)} hint={`di cui compensi ${money(f.totals.pay)}`} />
          <Tile
            label={`Cassa al ${formatDate(monthEnd(last.key))}`}
            value={money(f.endCash)}
            hint={scenario === "prudente" ? "scenario prudente" : "con tutti i contratti firmati"}
            tone={last.check === "ok" ? undefined : last.check === "attenzione" ? "warn" : "bad"}
          />
          <Tile
            label="Oltre la riserva"
            value={money(f.margin)}
            hint={`riserva minima ${money(f.reserve)}`}
            tone={f.margin >= 0 ? "ok" : f.endCash >= 0 ? "warn" : "bad"}
          />
        </div>

        <Section title="Mese per mese">
          <div className="overflow-x-auto rounded-[10px] border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-muted text-left text-xs text-muted-foreground">
                  <th className="px-3.5 py-2 font-medium">Voce</th>
                  {f.months.map((m) => (
                    <th key={m.key} className="px-3 py-2 text-right font-medium">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <SummaryRow label="Cassa inizio mese" values={f.months.map((m) => m.start)} muted />
                <SummaryRow label="+ Incassi" values={f.months.map((m) => m.income)} className="text-ok" />
                <SummaryRow label="− Uscite" values={f.months.map((m) => -m.expenses)} />
                <SummaryRow label="− Compensi" values={f.months.map((m) => -m.pay)} />
                <SummaryRow label="Cassa fine mese" values={f.months.map((m) => m.end)} strong />
                <tr>
                  <td className="px-3.5 py-2 text-muted-foreground">Controllo</td>
                  {f.months.map((m) => (
                    <td key={m.key} className="px-3 py-2 text-right">
                      <CheckChip check={m.check} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {f.sustainablePay != null ? (
              <>
                Compenso sostenibile per persona: <span className="font-medium text-foreground">{money(f.sustainablePay)} al mese</span>, lasciando intatta la
                riserva a fine periodo.{" "}
              </>
            ) : null}
            {f.beyond.income || f.beyond.expenses ? `Oltre il periodo: incassi ${money(f.beyond.income)}, uscite ${money(f.beyond.expenses)}. ` : null}
            Importi netti IVA.
          </p>
        </Section>

        {data.upcoming.length || f.late.length ? (
          <Section title="Da pagare e da incassare nei prossimi 14 giorni" count={data.upcoming.length}>
            <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
              {data.upcoming.map((r) => {
                const late = r.m.dueOn! < data.today;
                return (
                  <li key={r.m.id} className="relative flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 hover:bg-muted/40">
                    <CalendarClock className={cn("size-4 shrink-0", late ? "text-bad" : "text-muted-foreground")} aria-hidden />
                    <span className={cn("w-24 text-xs tabular-nums", late ? "font-medium text-bad" : "text-muted-foreground")}>
                      {late ? `in ritardo, ${formatDate(r.m.dueOn)}` : relativeDay(r.m.dueOn)}
                    </span>
                    <Link href={`/finanza/movimenti/${r.m.id}`} className="min-w-0 flex-1 truncate text-sm font-medium after:absolute after:inset-0">
                      {r.m.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      <Counterparty company={r.company} counterparty={r.m.counterparty} person={r.person} />
                    </span>
                    <Amount value={r.m.amount} direction={r.m.direction} className="text-sm font-medium" />
                    <MarkPaidButton id={r.m.id} direction={r.m.direction} compact />
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        <Section title="Il dettaglio" action={<span className="text-xs text-muted-foreground">Clic su una voce per vederla o modificarla</span>}>
          <div className="overflow-x-auto rounded-[10px] border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted text-left text-xs text-muted-foreground">
                  <th className="px-3.5 py-2 font-medium">Voce</th>
                  {f.months.map((m) => (
                    <th key={m.key} className="px-3 py-2 text-right font-medium">
                      {m.label}
                    </th>
                  ))}
                  <th className="px-3.5 py-2 text-right font-medium">Totale</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <GroupRows title="Incassi" rows={f.income} totals={f.months.map((m) => m.income)} total={f.totals.income} span={f.months.length} />
                <GroupRows title="Uscite" rows={f.expenses} totals={f.months.map((m) => m.expenses)} total={f.totals.expenses} span={f.months.length} />
                <GroupRows title="Compensi" rows={f.pay} totals={f.months.map((m) => m.pay)} total={f.totals.pay} span={f.months.length} />
              </tbody>
            </table>
          </div>
          {atRisk.length ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-warn" aria-hidden />
              <span>
                A rischio: {atRisk.map((r) => r.title).join(", ")}. Lo scenario <Link href={href({ scenario: "prudente" })} className="underline">Prudente</Link> le
                toglie.
              </span>
            </p>
          ) : null}
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Da pianificare" count={data.unplanned.length + data.toPlan.length}>
            {data.unplanned.length || data.toPlan.length ? (
              <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
                {data.toPlan.map((c) => (
                  <li key={c.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
                    <FileSignature className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground"> · contratto da {money(c.value)}, pianificato {money(c.planned)}</span>
                    </span>
                    <NewMovementButton
                      label="Pianifica"
                      defaults={{ direction: "entrata", category: "contratto", title: c.name, amount: c.toPlan, companyId: c.company?.id, projectId: c.project?.id, opportunityId: c.opportunityId }}
                    />
                  </li>
                ))}
                {data.unplanned.map((r) => (
                  <li key={r.m.id} className="relative flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 hover:bg-muted/40">
                    <Link href={`/finanza/movimenti/${r.m.id}`} className="min-w-0 flex-1 truncate text-sm font-medium after:absolute after:inset-0">
                      {r.m.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">senza data</span>
                    <Amount value={r.m.amount} direction={r.m.direction} className="text-sm" />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Tutte le voci hanno una data e ogni contratto firmato ha i suoi incassi in piano.</EmptyState>
            )}
          </Section>

          <Section title="Potenziale in trattativa" action={<Link href="/finanza/contratti" className="text-xs text-muted-foreground hover:underline">Contratti</Link>}>
            <div className="flex flex-col gap-3 rounded-[10px] border bg-card p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-sm">
                  <span className="font-semibold tabular-nums">{money(data.pipeline.quoted)}</span> in preventivi inviati
                  <span className="text-muted-foreground"> · {money(data.pipeline.lead)} in lead</span>
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {data.pipeline.rows.slice(0, 5).map((r) => (
                  <li key={r.o.id} className="flex items-center gap-2 text-[13px]">
                    <Chip tone={r.o.stage === "in_progress" ? "cold" : "neutral"}>{r.o.stage === "in_progress" ? "Preventivo" : "Lead"}</Chip>
                    <Link href={`/pipeline/${r.o.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {r.o.name}
                    </Link>
                    <span className="tabular-nums text-muted-foreground">{money(r.o.initialValue)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Non entra nella cassa finché il deal non è vinto: allora diventa un incasso da pianificare.</p>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

function SummaryRow({ label, values, strong, muted, className }: { label: string; values: number[]; strong?: boolean; muted?: boolean; className?: string }) {
  return (
    <tr className={cn("border-b", strong && "bg-muted/40 font-semibold")}>
      <td className={cn("px-3.5 py-2", muted && "text-muted-foreground")}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={cn("px-3 py-2 text-right whitespace-nowrap", muted && "text-muted-foreground", v !== 0 && className, strong && v < 0 && "text-bad")}>
          {v === 0 && !strong && !muted ? <span className="text-muted-foreground/50">—</span> : money(v)}
        </td>
      ))}
    </tr>
  );
}

function GroupRows({ title, rows, totals, total, span }: { title: string; rows: ForecastRow[]; totals: number[]; total: number; span: number }) {
  return (
    <>
      <tr className="border-b bg-muted/60">
        <td colSpan={span + 2} className="px-3.5 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </td>
      </tr>
      {rows.length ? (
        rows.map((r) => (
          <tr key={r.key} className="border-b hover:bg-muted/30">
            <td className="max-w-[320px] px-3.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <Link
                  href={r.ids.length === 1 ? `/finanza/movimenti/${r.ids[0]}` : `/finanza/movimenti?q=${encodeURIComponent(r.title)}`}
                  className="truncate hover:underline"
                >
                  {r.title}
                </Link>
                {r.atRisk ? <Chip tone="warn">a rischio</Chip> : null}
                {r.late ? <Chip tone="bad">in ritardo</Chip> : null}
              </div>
            </td>
            {r.byMonth.map((v, i) => (
              <td key={i} className="px-3 py-1.5 text-right whitespace-nowrap">
                {v ? money(v) : <span className="text-muted-foreground/40">—</span>}
              </td>
            ))}
            <td className="px-3.5 py-1.5 text-right font-medium whitespace-nowrap">{money(r.total)}</td>
          </tr>
        ))
      ) : (
        <tr className="border-b">
          <td colSpan={span + 2} className="px-3.5 py-2 text-[13px] text-muted-foreground">
            Nessuna voce nel periodo
          </td>
        </tr>
      )}
      <tr className="border-b font-medium">
        <td className="px-3.5 py-1.5 text-muted-foreground">Totale {title.toLowerCase()}</td>
        {totals.map((v, i) => (
          <td key={i} className="px-3 py-1.5 text-right whitespace-nowrap">
            {money(v)}
          </td>
        ))}
        <td className="px-3.5 py-1.5 text-right whitespace-nowrap">{money(total)}</td>
      </tr>
    </>
  );
}
