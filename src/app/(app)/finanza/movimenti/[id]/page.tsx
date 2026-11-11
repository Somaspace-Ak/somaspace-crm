import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DeleteMovementButton, MarkPaidButton } from "@/components/crm/finance-dialogs";
import { Amount, CashStatusChip, categoryLabel, money } from "@/components/crm/finance-ui";
import { InlineField } from "@/components/crm/inline-field";
import { PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { Attribute, Attributes, Breadcrumb, RecordLayout, SideBlock } from "@/components/crm/record";
import { CASH_CATEGORY } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { canSeeFinance, getMovement } from "@/server/finance";
import { getViewer } from "@/server/session";

export default function MovementPage(props: PageProps<"/finanza/movimenti/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Movement {...props} />
    </Suspense>
  );
}

async function Movement({ params }: PageProps<"/finanza/movimenti/[id]">) {
  const { id } = await params;
  const { viewer } = await getViewer();
  if (!canSeeFinance(viewer) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getMovement(id);
  if (!data) notFound();
  const { m, company, project, person, opportunity } = data;
  const isIn = m.direction === "entrata";
  const paidWord = isIn ? "Incassato" : "Pagato";

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: "Entrate e uscite", href: "/finanza/movimenti" }, { label: m.title }]} />}
        title={m.title}
        actions={
          <>
            {m.status !== "pagato" ? <MarkPaidButton id={m.id} direction={m.direction} /> : null}
            <DeleteMovementButton id={m.id} />
          </>
        }
      />
      <RecordLayout
        side={
          <SideBlock title="Dettagli">
            <Attributes>
              <Attribute label="Tipo">
                <InlineField
                  entity="movement"
                  id={m.id}
                  field="direction"
                  type="select"
                  nullable={false}
                  value={m.direction}
                  options={[
                    { value: "entrata", label: "Entrata" },
                    { value: "uscita", label: "Uscita" },
                  ]}
                >
                  {isIn ? "Entrata" : "Uscita"}
                </InlineField>
              </Attribute>
              <Attribute label="Categoria">
                <InlineField
                  entity="movement"
                  id={m.id}
                  field="category"
                  type="select"
                  nullable={false}
                  value={m.category}
                  options={Object.entries(CASH_CATEGORY)
                    .filter(([, c]) => c.direction === m.direction)
                    .map(([value, c]) => ({ value, label: c.label }))}
                >
                  {categoryLabel(m.category)}
                </InlineField>
              </Attribute>
              <Attribute label="Importo">
                <InlineField entity="movement" id={m.id} field="amount" type="number" nullable={false} value={m.amount}>
                  {money(m.amount)}
                </InlineField>
              </Attribute>
              <Attribute label={isIn ? "Previsto il" : "Scadenza"}>
                <InlineField entity="movement" id={m.id} field="dueOn" type="date" value={m.dueOn} placeholder="Da pianificare">
                  {m.dueOn ? formatDate(m.dueOn) : null}
                </InlineField>
              </Attribute>
              <Attribute label="Stato">
                <InlineField
                  entity="movement"
                  id={m.id}
                  field="status"
                  type="select"
                  nullable={false}
                  value={m.status}
                  options={[
                    { value: "previsto", label: "Previsto" },
                    { value: "fatturato", label: isIn ? "Fatturato" : "Da pagare (fattura ricevuta)" },
                    { value: "pagato", label: paidWord },
                  ]}
                >
                  <CashStatusChip status={m.status} direction={m.direction} />
                </InlineField>
              </Attribute>
              <Attribute label={`${paidWord} il`}>
                <InlineField entity="movement" id={m.id} field="paidOn" type="date" value={m.paidOn} placeholder="—">
                  {m.paidOn ? formatDate(m.paidOn) : null}
                </InlineField>
              </Attribute>
              <Attribute label="Certezza">
                <InlineField
                  entity="movement"
                  id={m.id}
                  field="certainty"
                  type="select"
                  nullable={false}
                  value={m.certainty}
                  options={[
                    { value: "sicuro", label: "Sicura" },
                    { value: "a_rischio", label: "A rischio" },
                  ]}
                >
                  {m.certainty === "sicuro" ? "Sicura" : "A rischio: lo scenario prudente la toglie"}
                </InlineField>
              </Attribute>
              {m.category === "compensi" ? (
                <Attribute label="A chi">
                  <InlineField entity="movement" id={m.id} field="userId" type="user" value={m.userId}>
                    {person?.id ? person.name : null}
                  </InlineField>
                </Attribute>
              ) : (
                <>
                  <Attribute label={isIn ? "Cliente" : "Fornitore"}>
                    <InlineField entity="movement" id={m.id} field="companyId" type="company" value={m.companyId} placeholder="Collega un'azienda del CRM">
                      {company?.id ? (
                        <Link href={`/companies/${company.id}`} className="hover:underline">
                          {company.name}
                        </Link>
                      ) : null}
                    </InlineField>
                  </Attribute>
                  {company?.id ? null : (
                    <Attribute label="Nome">
                      <InlineField entity="movement" id={m.id} field="counterparty" value={m.counterparty} placeholder="Chi, se non è nel CRM" />
                    </Attribute>
                  )}
                </>
              )}
              <Attribute label="Progetto">
                <InlineField entity="movement" id={m.id} field="projectId" type="project" value={m.projectId} placeholder="Collega un progetto">
                  {project?.id ? (
                    <Link href={`/progetti/${project.id}`} className="hover:underline">
                      {project.name}
                    </Link>
                  ) : null}
                </InlineField>
              </Attribute>
              {opportunity ? (
                <Attribute label="Contratto">
                  <Link href={`/pipeline/${opportunity.id}`} className="hover:underline">
                    {opportunity.name}
                  </Link>
                </Attribute>
              ) : null}
              <Attribute label="Fattura n.">
                <InlineField entity="movement" id={m.id} field="invoiceRef" value={m.invoiceRef} />
              </Attribute>
            </Attributes>
          </SideBlock>
        }
      >
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-4">
            <span className="text-xs text-muted-foreground">{isIn ? "Entra" : "Esce"}</span>
            <Amount value={m.amount} direction={m.direction} className="text-3xl font-semibold tracking-[-0.02em]" />
            <span className="text-[13px] text-muted-foreground">
              {m.status === "pagato"
                ? `${paidWord} il ${formatDate(m.paidOn)}`
                : m.dueOn
                  ? `${isIn ? "Previsto" : "Da pagare"} il ${formatDate(m.dueOn)}`
                  : "Senza data: non entra nel previsionale finché non la metti"}
            </span>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold">Voce</h2>
            <InlineField entity="movement" id={m.id} field="title" value={m.title}>
              <span className="text-sm">{m.title}</span>
            </InlineField>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold">Note</h2>
            <InlineField entity="movement" id={m.id} field="notes" type="textarea" value={m.notes} placeholder="Ipotesi, accordi, da verificare">
              {m.notes ? <p className="text-sm whitespace-pre-line">{m.notes}</p> : null}
            </InlineField>
          </section>
        </div>
      </RecordLayout>
    </>
  );
}
