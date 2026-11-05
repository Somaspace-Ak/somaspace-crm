import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {AgentMark, Chip, ModeChip, StageChip, StrengthBar, UserAvatar } from "@/components/crm/chips";
import { PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { QueueActions } from "@/components/crm/queue-actions";
import { Attribute, Attributes, Breadcrumb, RecordHero, RecordLayout, SideBlock } from "@/components/crm/record";
import { Timeline } from "@/components/crm/timeline";
import { formatEuro, fullName, relativeDay } from "@/lib/format";
import { FACT_KIND, MET_VIA, MODE } from "@/lib/labels";
import { CreateButton } from "@/components/crm/create-dialogs";
import { InlineField } from "@/components/crm/inline-field";
import { acceptModeProposal, dismissModeProposal } from "@/server/actions";
import { getPerson, listEventOptions } from "@/server/queries";
import { getViewer } from "@/server/session";

export default function PersonPage(props: PageProps<"/people/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Person {...props} />
    </Suspense>
  );
}

async function Person({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const { viewer } = await getViewer();
  const [data, eventOptions] = await Promise.all([getPerson(id, viewer), listEventOptions()]);
  if (!data) notFound();
  const { p, company, owner, event } = data;
  const name = fullName(p);

  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb items={[{ label: "Persone", href: "/people" }, ...(company ? [{ label: company.name, href: `/companies/${company.id}` }] : []), { label: name }]} />} title={name} />
      <RecordHero
        avatar={<UserAvatar initials={`${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase()} className="size-14 text-lg" />}
        title={name}
        subtitle={[p.position, company?.name].filter(Boolean).join(" · ")}
        chips={
          <>
            <ModeChip mode={p.followupMode} />
            {p.status === "archiviato" ? <Chip>Archiviato</Chip> : null}
            {p.email ? <span className="text-xs text-muted-foreground">{p.email}</span> : null}
            <span className="ml-1">
              <StrengthBar value={p.connectionStrength} showLabel />
            </span>
          </>
        }
        actions={<>
            <CreateButton kind="interazione" defaults={{ personId: p.id, companyId: p.companyId ?? undefined }} label="Interazione" />
            <CreateButton kind="opportunita" defaults={{ personId: p.id, companyId: p.companyId ?? undefined }} label="Opportunità" />
          </>}
      />
      <RecordLayout
        side={
          <>
            <SideBlock title="Follow-up">
              <div className="flex flex-col gap-3 rounded-[10px] border bg-card p-3">
                {data.openQuote ? (
                  <p className="text-xs text-muted-foreground">
                    Referente di <Link href={`/pipeline/${data.openQuote.id}`} className="font-medium text-foreground hover:underline">{data.openQuote.name}</Link>:
                    comanda la sequenza del preventivo, il follow-up {p.followupMode ?? ""} è sospeso.
                  </p>
                ) : (
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Prossimo</span>
                    <span className="text-sm font-medium">{p.nextFollowupOn ? relativeDay(p.nextFollowupOn) : "Nessuno"}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Modalità</span>
                  <div className="w-32">
                    <InlineField
                      entity="person"
                      id={p.id}
                      field="followupMode"
                      type="select"
                      value={p.followupMode}
                      placeholder="Da decidere"
                      options={Object.entries(MODE).map(([v, o]) => ({ value: v, label: o.label }))}
                    >
                      <ModeChip mode={p.followupMode} />
                    </InlineField>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Rimanda a</span>
                  <div className="w-32">
                    <InlineField entity="person" id={p.id} field="snoozeUntil" type="date" value={p.snoozeUntil} placeholder="Nessuna data">
                      {p.snoozeUntil ? relativeDay(p.snoozeUntil) : null}
                    </InlineField>
                  </div>
                </div>
                {p.proposedMode && p.proposedMode !== p.followupMode ? (
                  <div className="flex flex-col gap-2 border-t pt-3">
                    <AgentMark label={`Propone: ${MODE[p.proposedMode].label}`} />
                    {p.proposedModeReason ? <p className="text-xs text-muted-foreground">{p.proposedModeReason}</p> : null}
                    <div className="flex gap-2">
                      <form action={acceptModeProposal.bind(null, p.id)}>
                        <Button size="sm" type="submit">
                          Accetta
                        </Button>
                      </form>
                      <form action={dismissModeProposal.bind(null, p.id)}>
                        <Button size="sm" variant="ghost" type="submit">
                          Scarta
                        </Button>
                      </form>
                    </div>
                  </div>
                ) : null}
                <div className="border-t pt-3">
                  <QueueActions kind="persona" id={p.id} href={`/people/${p.id}`} hasDraft={false} askOutcome={false} />
                </div>
              </div>
            </SideBlock>
            <SideBlock title="Attributi">
              <Attributes>
                <Attribute label="Nome">
                  <InlineField entity="person" id={p.id} field="firstName" value={p.firstName} nullable={false} />
                </Attribute>
                <Attribute label="Cognome">
                  <InlineField entity="person" id={p.id} field="lastName" value={p.lastName} />
                </Attribute>
                <Attribute label="Azienda">
                  <InlineField entity="person" id={p.id} field="companyId" type="company" value={p.companyId}>
                    {company?.name}
                  </InlineField>
                </Attribute>
                <Attribute label="Ruolo">
                  <InlineField entity="person" id={p.id} field="position" value={p.position} />
                </Attribute>
                <Attribute label="Email">
                  <InlineField entity="person" id={p.id} field="email" type="email" value={p.email} />
                </Attribute>
                <Attribute label="Altre email">
                  <InlineField entity="person" id={p.id} field="otherEmails" type="tags" value={p.otherEmails} />
                </Attribute>
                <Attribute label="Telefono">
                  <InlineField entity="person" id={p.id} field="phone" value={p.phone} />
                </Attribute>
                <Attribute label="LinkedIn">
                  <InlineField entity="person" id={p.id} field="linkedin" type="url" value={p.linkedin}>
                    {p.linkedin?.replace(/^https?:\/\/(www\.)?/, "")}
                  </InlineField>
                </Attribute>
                <Attribute label="Lingua">
                  <InlineField
                    entity="person"
                    id={p.id}
                    field="language"
                    type="select"
                    value={p.language}
                    options={[
                      { value: "it", label: "Italiano" },
                      { value: "en", label: "Inglese" },
                    ]}
                  >
                    {p.language === "it" ? "Italiano" : p.language === "en" ? "Inglese" : null}
                  </InlineField>
                </Attribute>
                <Attribute label="Conosciuto tramite">
                  <InlineField
                    entity="person"
                    id={p.id}
                    field="metVia"
                    type="select"
                    value={p.metVia}
                    options={Object.entries(MET_VIA).map(([v, l]) => ({ value: v, label: l }))}
                  >
                    {p.metVia ? MET_VIA[p.metVia] : null}
                  </InlineField>
                </Attribute>
                <Attribute label="Evento">
                  <span className="flex min-w-0 items-start gap-1">
                    <InlineField entity="person" id={p.id} field="eventId" type="select" value={p.eventId} options={eventOptions}>
                      {event?.name}
                    </InlineField>
                    {event ? (
                      <Link
                        href={`/eventi/${event.id}`}
                        aria-label={`Apri ${event.name}`}
                        className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    ) : null}
                  </span>
                </Attribute>
                <Attribute label="Interessi">
                  <InlineField entity="person" id={p.id} field="interests" type="tags" value={p.interests}>
                    <span className="flex flex-wrap gap-1">{p.interests.map((x) => <Chip key={x}>{x}</Chip>)}</span>
                  </InlineField>
                </Attribute>
                <Attribute label="Forza relazione">
                  <StrengthBar value={p.connectionStrength} showLabel />
                </Attribute>
                <Attribute label="Ultimo contatto">{relativeDay(p.lastInteractionAt)}</Attribute>
                <Attribute label="Owner">
                  <InlineField entity="person" id={p.id} field="ownerId" type="user" value={p.ownerId}>
                    {owner?.name}
                  </InlineField>
                </Attribute>
              </Attributes>
            </SideBlock>
            <SideBlock title="Note del primo meeting">
              <InlineField entity="person" id={p.id} field="firstMeetingNotes" type="textarea" value={p.firstMeetingNotes} placeholder="Aggiungi il contesto del primo incontro">
                <span className="whitespace-pre-wrap text-sm text-foreground/80">{p.firstMeetingNotes}</span>
              </InlineField>
            </SideBlock>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {data.facts.length ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold">Cosa sappiamo</h2>
              <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
                {data.facts.map((f) => (
                  <li key={f.id} className="flex flex-col gap-0.5 px-3 py-2.5">
                    <span className="text-sm">{f.text}</span>
                    <span className="text-xs text-muted-foreground">{FACT_KIND[f.kind]}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {data.opportunities.length ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold">Opportunità</h2>
              <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
                {data.opportunities.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Link href={`/pipeline/${o.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                      {o.name}
                    </Link>
                    <span className="text-sm tabular-nums">{formatEuro(o.finalValue ?? o.initialValue)}</span>
                    <StageChip stage={o.stage} />
                  </li>
                ))}
              </ul>
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
