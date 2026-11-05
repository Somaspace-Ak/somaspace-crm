import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Check } from "lucide-react";
import {CompanyLogo, HealthChip, StageChip } from "@/components/crm/chips";
import { PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { QueueActions } from "@/components/crm/queue-actions";
import { Attribute, Attributes, Breadcrumb, RecordHero, RecordLayout, SideBlock } from "@/components/crm/record";
import { Timeline } from "@/components/crm/timeline";
import { addDays } from "@/lib/followup/dates";
import { formatDate, formatEuro, fullName, relativeDay } from "@/lib/format";
import { LOST_REASON } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { CreateButton } from "@/components/crm/create-dialogs";
import { InlineField } from "@/components/crm/inline-field";
import { getFollowupSettings, getOpportunity } from "@/server/queries";
import { getViewer } from "@/server/session";

const STEP_LABEL = ["Conferma arrivo", "Proposta di una call", "Valore aggiunto", "Chiusura cortese"];

export default function OpportunityPage(props: PageProps<"/pipeline/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Opportunity {...props} />
    </Suspense>
  );
}

async function Opportunity({ params }: PageProps<"/pipeline/[id]">) {
  const { id } = await params;
  const { viewer } = await getViewer();
  const [data, settings] = await Promise.all([getOpportunity(id, viewer), getFollowupSettings()]);
  const sequence = settings.quoteSequence;
  if (!data) notFound();
  const { o, company, person, owner, project } = data;

  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb items={[{ label: "Pipeline", href: "/pipeline" }, { label: o.name }]} />} title={o.name} />
      <RecordHero
        avatar={<CompanyLogo name={company.name} className="size-14 rounded-xl text-lg" />}
        title={o.name}
        subtitle={<Link href={`/companies/${company.id}`} className="hover:text-foreground">{company.name}</Link>}
        chips={
          <>
            <StageChip stage={o.stage} />
            <span className="text-sm font-semibold tabular-nums">{formatEuro(o.finalValue ?? o.initialValue)}</span>
            {o.stage === "in_progress" ? <span className="text-xs text-muted-foreground">Passo {Math.min(o.followupStep + (o.followupStep < 4 ? 1 : 0), 4)} di 4</span> : null}
          </>
        }
        actions={<CreateButton kind="interazione" defaults={{ opportunityId: o.id, companyId: o.companyId, personId: o.personId ?? undefined }} label="Interazione" />}
      />
      <RecordLayout
        side={
          <>
            <SideBlock title="Attributi">
              <Attributes>
                <Attribute label="Nome">
                  <InlineField entity="opportunity" id={o.id} field="name" value={o.name} nullable={false} />
                </Attribute>
                <Attribute label="Azienda">
                  <InlineField entity="opportunity" id={o.id} field="companyId" type="company" value={o.companyId} nullable={false}>
                    {company.name}
                  </InlineField>
                </Attribute>
                <Attribute label="Referente">
                  <InlineField entity="opportunity" id={o.id} field="personId" type="person" value={o.personId}>
                    {person ? fullName(person) : null}
                  </InlineField>
                </Attribute>
                <Attribute label="Valore iniziale">
                  <InlineField entity="opportunity" id={o.id} field="initialValue" type="number" value={o.initialValue}>
                    {formatEuro(o.initialValue)}
                  </InlineField>
                </Attribute>
                <Attribute label="Valore finale">
                  <InlineField entity="opportunity" id={o.id} field="finalValue" type="number" value={o.finalValue}>
                    {o.finalValue ? formatEuro(o.finalValue) : null}
                  </InlineField>
                </Attribute>
                <Attribute label="Preventivo inviato">
                  <InlineField entity="opportunity" id={o.id} field="quoteSentOn" type="date" value={o.quoteSentOn}>
                    {o.quoteSentOn ? formatDate(o.quoteSentOn) : null}
                  </InlineField>
                </Attribute>
                <Attribute label="Link al preventivo">
                  <InlineField entity="opportunity" id={o.id} field="quoteUrl" type="url" value={o.quoteUrl}>
                    Preventivo su Drive
                  </InlineField>
                </Attribute>
                <Attribute label="Rimanda a">
                  <InlineField entity="opportunity" id={o.id} field="snoozeUntil" type="date" value={o.snoozeUntil} placeholder="Nessuna data">
                    {o.snoozeUntil ? formatDate(o.snoozeUntil) : null}
                  </InlineField>
                </Attribute>
                <Attribute label="Motivo persa">{o.lostReason ? LOST_REASON[o.lostReason] : null}</Attribute>
                <Attribute label="Chiusa il">{o.closedOn ? formatDate(o.closedOn) : null}</Attribute>
                <Attribute label="Owner">
                  <InlineField entity="opportunity" id={o.id} field="ownerId" type="user" value={o.ownerId}>
                    {owner?.name}
                  </InlineField>
                </Attribute>
              </Attributes>
            </SideBlock>
            <SideBlock title="Note">
              <InlineField entity="opportunity" id={o.id} field="notes" type="textarea" value={o.notes} placeholder="Aggiungi note">
                <span className="whitespace-pre-wrap text-sm text-foreground/80">{o.notes}</span>
              </InlineField>
            </SideBlock>
            {project ? (
              <SideBlock title="Progetto">
                <Link href={`/progetti/${project.id}`} className="flex items-center justify-between gap-2 rounded-[10px] border bg-card p-3 hover:bg-muted/40">
                  <span className="text-sm font-medium">{project.name}</span>
                  <HealthChip value={project.health} />
                </Link>
              </SideBlock>
            ) : null}
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {o.stage === "in_progress" && o.quoteSentOn ? (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold">Sequenza di follow-up</h2>
                <span className="text-xs text-muted-foreground">
                  {o.nextFollowupOn ? `prossimo passo ${relativeDay(o.nextFollowupOn)}` : ""}
                </span>
                <div className="ml-auto">
                  <QueueActions kind="opportunita" id={o.id} href={`/pipeline/${o.id}`} hasDraft={false} askOutcome={o.followupStep >= 4} />
                </div>
              </div>
              <ol className="grid gap-2 sm:grid-cols-4">
                {sequence.map((days, i) => {
                  const done = i < o.followupStep;
                  const next = i === o.followupStep;
                  return (
                    <li
                      key={days}
                      className={cn(
                        "flex flex-col gap-1 rounded-[10px] border bg-card p-3",
                        done && "bg-muted/40",
                        next && "border-foreground/30 ring-1 ring-foreground/10",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {done ? <Check className="size-3 text-emerald-600" aria-label="fatto" /> : null}
                        Passo {i + 1} · +{days} giorni
                      </span>
                      <span className="text-sm font-medium">{STEP_LABEL[i]}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(addDays(o.quoteSentOn!, days))}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}
          <section className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold">Timeline</h2>
            <Timeline items={data.timeline} />
          </section>
        </div>
      </RecordLayout>
    </>
  );
}
