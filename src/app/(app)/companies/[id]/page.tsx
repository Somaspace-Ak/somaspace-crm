import Link from "next/link";
import { ApproveButtons } from "@/components/crm/approve-buttons";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {AgentMark, Chip, CompanyLogo, HealthChip, ModeChip, RelationshipChip, StageChip, StrengthBar, UserAvatar } from "@/components/crm/chips";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { AgentBanner, Attribute, Attributes, Breadcrumb, RecordHero, RecordLayout, SideBlock, lineTab, lineTabsList } from "@/components/crm/record";
import { Timeline } from "@/components/crm/timeline";
import { formatEuro, fullName, relativeDay } from "@/lib/format";
import { FACT_KIND, PROJECT_STATUS, RELATIONSHIP } from "@/lib/labels";
import { CreateButton } from "@/components/crm/create-dialogs";
import { InlineField } from "@/components/crm/inline-field";
import { verifyCompany } from "@/server/actions";
import { getCompany } from "@/server/queries";
import { getViewer } from "@/server/session";

export default function CompanyPage(props: PageProps<"/companies/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Company {...props} />
    </Suspense>
  );
}

async function Company({ params }: PageProps<"/companies/[id]">) {
  const { id } = await params;
  const { viewer } = await getViewer();
  const data = await getCompany(id, viewer);
  if (!data) notFound();
  const { c, owner } = data;
  const toVerify = c.dataStatus === "da_verificare";

  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb items={[{ label: "Aziende", href: "/companies" }, { label: c.name }]} />} title={c.name} />
      {toVerify ? (
        <AgentBanner
          actions={
            <form action={verifyCompany.bind(null, c.id)}>
              <Button size="sm" type="submit">
                Verifica tutti
              </Button>
            </form>
          }
        >
          <b className="font-semibold">L&apos;agente ha arricchito questa scheda.</b> Descrizione, sito, LinkedIn e categoria vengono dal web: controllali.
          {c.sources ? <span className="text-muted-foreground"> Fonti: {c.sources}</span> : null}
        </AgentBanner>
      ) : null}
      <RecordHero
        avatar={<CompanyLogo name={c.name} className="size-14 rounded-xl text-lg" />}
        title={c.name}
        subtitle={c.website ? (
          <a href={c.website} target="_blank" rel="noreferrer" className="hover:text-foreground">
            {c.domains[0] ?? c.website.replace(/^https?:\/\//, "")}
          </a>
        ) : c.domains[0]}
        chips={
          <>
            <RelationshipChip value={c.relationship} />
            {c.categories.map((x) => (
              <Chip key={x}>{x}</Chip>
            ))}
            {c.country ? <Chip>{c.country}</Chip> : null}
            <span className="ml-1 text-xs text-muted-foreground">
              <StrengthBar value={c.connectionStrength} showLabel />
            </span>
          </>
        }
        actions={
          <>
            {owner ? <UserAvatar initials={owner.initials} name={owner.name} /> : null}
            <CreateButton kind="interazione" defaults={{ companyId: c.id }} label="Interazione" />
            <CreateButton kind="persona" defaults={{ companyId: c.id }} label="Persona" />
            <CreateButton kind="progetto" defaults={{ companyId: c.id }} label="Progetto" />
            <CreateButton kind="opportunita" defaults={{ companyId: c.id }} label="Opportunità" variant="default" />
          </>
        }
      />
      <RecordLayout
        side={
          <>
            <SideBlock title="Attributi">
              <Attributes>
                <Attribute label="Nome">
                  <InlineField entity="company" id={c.id} field="name" value={c.name} nullable={false} />
                </Attribute>
                <Attribute label="Descrizione">
                  <InlineField entity="company" id={c.id} field="description" type="textarea" value={c.description} />
                </Attribute>
                <Attribute label="Relazione">
                  <InlineField
                    entity="company"
                    id={c.id}
                    field="relationship"
                    type="select"
                    nullable={false}
                    value={c.relationship}
                    options={Object.entries(RELATIONSHIP).map(([v, o]) => ({ value: v, label: o.label }))}
                  >
                    <RelationshipChip value={c.relationship} />
                  </InlineField>
                </Attribute>
                <Attribute label="Categoria">
                  <InlineField entity="company" id={c.id} field="categories" type="tags" value={c.categories}>
                    <span className="flex flex-wrap gap-1">{c.categories.map((x) => <Chip key={x}>{x}</Chip>)}</span>
                  </InlineField>
                </Attribute>
                <Attribute label="Nazione">
                  <InlineField entity="company" id={c.id} field="country" value={c.country} />
                </Attribute>
                <Attribute label="Sito web">
                  <InlineField entity="company" id={c.id} field="website" type="url" value={c.website}>
                    {c.website?.replace(/^https?:\/\//, "")}
                  </InlineField>
                  {c.website ? (
                    <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                      Apri <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </Attribute>
                <Attribute label="LinkedIn">
                  <InlineField entity="company" id={c.id} field="linkedin" type="url" value={c.linkedin}>
                    {c.linkedin?.replace(/^https?:\/\/(www\.)?/, "")}
                  </InlineField>
                </Attribute>
                <Attribute label="Domini">
                  <InlineField entity="company" id={c.id} field="domains" type="tags" value={c.domains} />
                </Attribute>
                <Attribute label="Cartella Drive">
                  <InlineField entity="company" id={c.id} field="driveFolderUrl" type="url" value={c.driveFolderUrl}>
                    Cartella su Drive
                  </InlineField>
                </Attribute>
                <Attribute label="Owner">
                  <InlineField entity="company" id={c.id} field="ownerId" type="user" value={c.ownerId}>
                    {owner?.name}
                  </InlineField>
                </Attribute>
                <Attribute label="Forza relazione">
                  <StrengthBar value={c.connectionStrength} showLabel />
                </Attribute>
                <Attribute label="Ultimo contatto">{relativeDay(c.lastInteractionAt)}</Attribute>
              </Attributes>
            </SideBlock>
          </>
        }
      >
        <Tabs defaultValue="panoramica" className="gap-4">
          <TabsList variant="line" className={lineTabsList}>
            <TabsTrigger value="panoramica" className={lineTab}>Panoramica</TabsTrigger>
            <TabsTrigger value="persone" className={lineTab}>Persone {data.people.length}</TabsTrigger>
            <TabsTrigger value="opportunita" className={lineTab}>Opportunità {data.opportunities.length}</TabsTrigger>
            <TabsTrigger value="progetti" className={lineTab}>Progetti {data.projects.length}</TabsTrigger>
            <TabsTrigger value="timeline" className={lineTab}>Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="panoramica" className="flex flex-col gap-6">
            {c.agentSummary ? (
              <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
                <AgentMark label="Stato in breve" />
                <p className="text-sm">{c.agentSummary}</p>
              </section>
            ) : null}
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold">Cosa sappiamo</h2>
              {data.facts.length ? (
                <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
                  {data.facts.map((f) => (
                    <li key={f.id} className="flex flex-col gap-0.5 px-3 py-2.5">
                      <span className="text-sm">{f.text}</span>
                      <span className="text-xs text-muted-foreground">
                        {FACT_KIND[f.kind]} · da {f.sourceType === "email" ? "un'email" : f.sourceType === "meeting" ? "un meeting" : f.sourceType === "chiamata" ? "una chiamata" : "una nota"} · {relativeDay(f.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState>Ancora nessun fatto raccolto su questa azienda.</EmptyState>
              )}
            </section>
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold">Ultime interazioni</h2>
              <Timeline items={Object.assign(data.timeline.slice(0, 4), { hiddenCount: data.timeline.hiddenCount })} />
            </section>
          </TabsContent>

          <TabsContent value="persone">
            {data.people.length ? (
              <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
                {data.people.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Link href={`/people/${p.id}`} className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium hover:underline">{fullName(p)}</span>
                      <span className="text-xs text-muted-foreground">{p.position}</span>
                    </Link>
                    {p.status === "da_approvare" ? (
                      <>
                        <Chip tone="brand">Da approvare</Chip>
                        <ApproveButtons id={p.id} size="xs" />
                      </>
                    ) : (
                      <ModeChip mode={p.followupMode} />
                    )}
                    <StrengthBar value={p.connectionStrength} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Nessuna persona collegata.</EmptyState>
            )}
          </TabsContent>

          <TabsContent value="opportunita">
            {data.opportunities.length ? (
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
            ) : (
              <EmptyState>Nessuna opportunità.</EmptyState>
            )}
          </TabsContent>

          <TabsContent value="progetti">
            {data.projects.length ? (
              <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
                {data.projects.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Link href={`/progetti/${p.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                      {p.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">{PROJECT_STATUS[p.status]}</span>
                    <HealthChip value={p.health} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Nessun progetto. Si apre da solo quando un deal è vinto.</EmptyState>
            )}
          </TabsContent>

          <TabsContent value="timeline">
            <Timeline items={data.timeline} />
          </TabsContent>
        </Tabs>
      </RecordLayout>
    </>
  );
}
