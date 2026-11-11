import Link from "next/link";
import { getEntityFinance } from "@/server/finance";
import { NewMovementButton, type MovementDefaults } from "./finance-dialogs";
import { money } from "./finance-ui";
import { SideBlock } from "./record";

/**
 * Le cifre di un cliente, un progetto o un deal nella sua scheda: incassato, da incassare, pagato, da pagare.
 * Solo per i fondatori: chi la monta controlla il ruolo.
 */
export async function FinanceBlock({
  filter,
  defaults,
}: {
  filter: { companyId?: string; projectId?: string; opportunityId?: string };
  defaults: MovementDefaults;
}) {
  const f = await getEntityFinance(filter);
  const link = filter.companyId
    ? `/finanza/movimenti?azienda=${filter.companyId}&stato=tutte`
    : filter.projectId
      ? `/finanza/movimenti?progetto=${filter.projectId}&stato=tutte`
      : "/finanza/contratti";
  const lines = [
    { label: "Incassato", value: f.incassato, cls: "text-ok" },
    { label: "Da incassare", value: f.daIncassare, cls: "" },
    { label: "Pagato", value: f.pagato, cls: "text-muted-foreground" },
    { label: "Da pagare", value: f.daPagare, cls: "" },
  ].filter((l) => l.value);

  return (
    <SideBlock title="Soldi" action={<NewMovementButton variant="ghost" label="Voce" defaults={defaults} />}>
      {lines.length ? (
        <div className="flex flex-col gap-2">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
            {lines.map((l) => (
              <div key={l.label} className="contents">
                <dt className="text-muted-foreground">{l.label}</dt>
                <dd className={`text-right font-medium tabular-nums ${l.cls}`}>{money(l.value)}</dd>
              </div>
            ))}
          </dl>
          <Link href={link} className="text-xs text-muted-foreground hover:underline">
            {f.rows.length} {f.rows.length === 1 ? "voce" : "voci"} in Finanza
          </Link>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">Nessun incasso o pagamento registrato.</p>
      )}
    </SideBlock>
  );
}
