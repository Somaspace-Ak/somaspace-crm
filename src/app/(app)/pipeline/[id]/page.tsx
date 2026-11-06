import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CompanyLogo, HealthChip, StageChip, StepBar } from "@/components/crm/chips";
import { PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { QueueActions } from "@/components/crm/queue-actions";
import { Attribute, Attributes, Breadcrumb, RecordHero, RecordLayout, SideBlock } from "@/components/crm/record";
import { Timeline } from "@/components/crm/timeline";
import { formatDate, formatEuro, fullName, relativeDay } from "@/lib/format";
import { LOST_REASON } from "@/lib/labels";
import { CreateButton } from "@/components/crm/create-dialogs";
import { InlineField } from "@/components/crm/inline-field";
import { getFollowupSettings, getOpportunity } from "@/server/queries";
import { getViewer } from "@/server/session";

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
  const max = settings.quoteMaxReminders;
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
            {o.stage === "in_progress" ? (
              <span className="text-xs text-muted-foreground">
                Promemoria {Math.min(o.followupStep, max)} di {max}
              </span>
            ) : null}
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
                <h2 className="text-[13px] font-semibold">Promemoria del preventivo</h2>
                <span className="text-xs text-muted-foreground">
                  {o.nextFollowupOn ? `prossimo ${relativeDay(o.nextFollowupOn)}` : ""}
                </span>
                <div className="ml-auto">
                  <QueueActions kind="opportunita" id={o.id} href={`/pipeline/${o.id}`} hasDraft={false} askOutcome={o.followupStep >= max} />
                </div>
              </div>
              <p className="rounded-[10px] border bg-card p-3 text-[13px]">
                Preventivo inviato {formatDate(o.quoteSentOn)}. Se il cliente non risponde, un promemoria ogni {settings.quoteReminderDays} giorni
                dall&apos;ultimo contatto; se risponde e tu no, va subito in &quot;Ti hanno scritto&quot;.{" "}
                <span className="text-muted-foreground">
                  Promemoria fatti: {Math.min(o.followupStep, max)} di {max}
                  {o.followupStep >= max ? ": è il momento di decidere, Persa o Rimanda." : "."}
                </span>
              </p>
              <StepBar step={Math.min(o.followupStep, max)} total={max} />
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
