import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Chip } from "@/components/crm/chips";
import { MarkPaidButton, NewMovementButton } from "@/components/crm/finance-dialogs";
import { Amount, CashStatusChip, categoryLabel, Counterparty, LinkToggle, money } from "@/components/crm/finance-ui";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { monthKey, monthLabel } from "@/lib/finance/forecast";
import { todayInRome } from "@/lib/followup/dates";
import { formatDate } from "@/lib/format";
import { CASH_CATEGORY } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { canSeeFinance, listMovements, type MovementRow } from "@/server/finance";
import { getViewer } from "@/server/session";

export const metadata = { title: "Entrate e uscite" };

export default function MovementsPage(props: PageProps<"/finanza/movimenti">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Movements {...props} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

async function Movements({ searchParams }: PageProps<"/finanza/movimenti">) {
  const { viewer } = await getViewer();
  if (!canSeeFinance(viewer)) notFound();
  const sp = await searchParams;
  const tipo = sp.tipo === "entrate" ? "entrate" : sp.tipo === "uscite" ? "uscite" : undefined;
  const stato = sp.stato === "pagate" ? "pagate" : sp.stato === "tutte" ? "tutte" : "aperte";
  const q = one(sp.q);
  const azienda = one(sp.azienda);
  const progetto = one(sp.progetto);
  const controparte = one(sp.controparte);
  const categoria = one(sp.categoria) && one(sp.categoria)! in CASH_CATEGORY ? (one(sp.categoria) as keyof typeof CASH_CATEGORY) : undefined;
  const rows = await listMovements({
    direction: tipo === "entrate" ? "entrata" : tipo === "uscite" ? "uscita" : undefined,
    open: stato === "aperte",
    paid: stato === "pagate",
    q,
    companyId: azienda && /^[0-9a-f-]{36}$/.test(azienda) ? azienda : undefined,
    projectId: progetto && /^[0-9a-f-]{36}$/.test(progetto) ? progetto : undefined,
    counterparty: controparte,
    category: categoria,
  });
  const today = todayInRome();

  const href = (p: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { tipo, stato: stato === "aperte" ? undefined : stato, q, azienda, progetto, controparte, categoria, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/finanza/movimenti?${s}` : "/finanza/movimenti";
  };

  // Per mese: prima le voci senza data, poi in ordine; le pagate per data di pagamento
  const groups = new Map<string, MovementRow[]>();
  for (const r of rows) {
    const day = r.m.status === "pagato" ? (r.m.paidOn ?? r.m.dueOn) : r.m.dueOn;
    const key = day ? monthKey(day) : "0000";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (stato === "pagate" ? b.localeCompare(a) : a.localeCompare(b)));
  const totalIn = rows.filter((r) => r.m.direction === "entrata").reduce((s, r) => s + r.m.amount, 0);
  const totalOut = rows.filter((r) => r.m.direction === "uscita").reduce((s, r) => s + r.m.amount, 0);
  const filterLabel = categoria
    ? CASH_CATEGORY[categoria].label
    : azienda || progetto || controparte || q
      ? (controparte ?? q ?? (azienda ? rows[0]?.company?.name : rows[0]?.project?.name) ?? "filtro")
      : null;

  return (
    <>
      <PageHeader
        title="Entrate e uscite"
        description="Ogni incasso e ogni pagamento, previsto e fatto"
        actions={
          <>
            <LinkToggle
              label="Tipo"
              options={[
                { href: href({ tipo: undefined }), label: "Tutte", active: !tipo },
                { href: href({ tipo: "entrate" }), label: "Entrate", active: tipo === "entrate" },
                { href: href({ tipo: "uscite" }), label: "Uscite", active: tipo === "uscite" },
              ]}
            />
            <LinkToggle
              label="Stato"
              options={[
                { href: href({ stato: undefined }), label: "Da fare", active: stato === "aperte" },
                { href: href({ stato: "pagate" }), label: "Fatte", active: stato === "pagate" },
                { href: href({ stato: "tutte" }), label: "Tutto", active: stato === "tutte" },
              ]}
            />
            <NewMovementButton variant="default" defaults={{ direction: tipo === "entrate" ? "entrata" : "uscita" }} />
          </>
        }
      />
      <div className="flex max-w-5xl flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          <form action="/finanza/movimenti" className="flex min-w-56 flex-1">
            {tipo ? <input type="hidden" name="tipo" value={tipo} /> : null}
            {stato !== "aperte" ? <input type="hidden" name="stato" value={stato} /> : null}
            <input
              name="q"
              defaultValue={q}
              placeholder="Cerca una voce, un cliente, un fornitore"
              className="h-8 w-full max-w-sm rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </form>
          {filterLabel ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              Solo: <span className="font-medium text-foreground">{filterLabel}</span>
              <Link href={href({ azienda: undefined, progetto: undefined, controparte: undefined, categoria: undefined, q: undefined })} className="underline">
                togli
              </Link>
            </span>
          ) : null}
          <span className="ml-auto tabular-nums text-muted-foreground">
            Entrate <span className="font-medium text-ok">{money(totalIn)}</span> · Uscite <span className="font-medium text-foreground">{money(totalOut)}</span>
          </span>
        </div>

        {rows.length ? (
          ordered.map(([key, list]) => {
            const net = list.reduce((s, r) => s + (r.m.direction === "entrata" ? r.m.amount : -r.m.amount), 0);
            return (
              <section key={key} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold">{key === "0000" ? "Senza data" : monthLabel(key).replace(/ (\d\d)$/, " 20$1")}</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    saldo del mese {net >= 0 ? "+" : "−"}
                    {money(Math.abs(net))}
                  </span>
                </div>
                <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
                  {list.map((r) => {
                    const open = r.m.status !== "pagato";
                    const late = open && r.m.dueOn && r.m.dueOn < today;
                    return (
                      <li key={r.m.id} className="relative flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 hover:bg-muted/40">
                        <span className={cn("w-14 shrink-0 text-xs tabular-nums", late ? "font-medium text-bad" : "text-muted-foreground")}>
                          {formatDate(open ? r.m.dueOn : (r.m.paidOn ?? r.m.dueOn))}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <Link href={`/finanza/movimenti/${r.m.id}`} className="truncate text-sm font-medium after:absolute after:inset-0">
                            {r.m.title}
                          </Link>
                          <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                            <Counterparty company={r.company} counterparty={r.m.counterparty} person={r.person} />
                            {r.project?.id ? (
                              <Link href={`/progetti/${r.project.id}`} className="relative z-10 hover:underline">
                                · {r.project.name}
                              </Link>
                            ) : null}
                            <span>· {categoryLabel(r.m.category)}</span>
                          </span>
                        </div>
                        {r.m.certainty === "a_rischio" && open ? <Chip tone="warn">a rischio</Chip> : null}
                        {late ? <Chip tone="bad">in ritardo</Chip> : <CashStatusChip status={r.m.status} direction={r.m.direction} />}
                        <Amount value={r.m.amount} direction={r.m.direction} className="w-24 text-right text-sm font-medium" />
                        {open ? <MarkPaidButton id={r.m.id} direction={r.m.direction} compact /> : <span className="hidden w-[86px] sm:block" />}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        ) : (
          <EmptyState>
            {stato === "aperte" ? "Niente da pagare o da incassare con questi filtri." : "Nessuna voce con questi filtri."} Una voce nuova: Nuova voce, in alto.
          </EmptyState>
        )}
      </div>
    </>
  );
}
