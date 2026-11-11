import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BalanceButton, DeleteBalanceButton, FinanceSettingsForm } from "@/components/crm/finance-dialogs";
import { money, Tile } from "@/components/crm/finance-ui";
import { EmptyState, PageHeader, PageSkeleton, Section } from "@/components/crm/page-header";
import { formatDate, formatLongDate } from "@/lib/format";
import { canSeeFinance, getBalances, loadFinanceSettings } from "@/server/finance";
import { getViewer } from "@/server/session";

export const metadata = { title: "Banca" };

export default function BankPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Bank />
    </Suspense>
  );
}

async function Bank() {
  const { viewer } = await getViewer();
  if (!canSeeFinance(viewer)) notFound();
  const [rows, cfg] = await Promise.all([getBalances(), loadFinanceSettings()]);
  const last = rows[0]?.b;

  return (
    <>
      <PageHeader title="Banca" description="Il saldo del conto, da cui parte il previsionale" actions={<BalanceButton variant="default" />} />
      <div className="flex max-w-3xl flex-col gap-8 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Saldo" value={last ? money(last.amount) : "—"} hint={last ? `al ${formatLongDate(last.on)}` : "da inserire"} />
          <Tile label="Riserva minima" value={money(cfg.reserve)} hint="sotto metà, un mese va in Attenzione" />
        </div>
        <Section title="Saldi registrati" count={rows.length}>
          {rows.length ? (
            <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
              {rows.map(({ b, by }) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-sm">
                  <span className="w-20 text-xs text-muted-foreground tabular-nums">{formatDate(b.on)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {b.account}
                    {b.note ? <span className="text-muted-foreground"> · {b.note}</span> : null}
                    {by?.name ? <span className="text-xs text-muted-foreground"> · {by.name.split(" ")[0]}</span> : null}
                  </span>
                  <span className="font-medium tabular-nums">{money(b.amount)}</span>
                  <DeleteBalanceButton id={b.id} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Nessun saldo. Inserisci quello di oggi: il previsionale parte da lì.</EmptyState>
          )}
          <p className="text-xs text-muted-foreground">
            Per ora il saldo si inserisce a mano, quando guardi il conto. Il collegamento diretto con la banca (movimenti importati e riconciliati) è il passo successivo.
          </p>
        </Section>
        <Section title="Impostazioni del previsionale">
          <FinanceSettingsForm reserve={cfg.reserve} months={cfg.months} />
        </Section>
      </div>
    </>
  );
}
