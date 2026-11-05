import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Mic, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {AgentMark, Chip, CompanyLogo, HealthChip } from "@/components/crm/chips";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { Attribute, Attributes, Breadcrumb, RecordHero, RecordLayout, SideBlock, lineTab, lineTabsList } from "@/components/crm/record";
import { TaskList } from "@/components/crm/task-list";
import { Timeline } from "@/components/crm/timeline";
import { formatDate, formatEuro, relativeDay } from "@/lib/format";
import { FACT_KIND, HEALTH, MEETING_SOURCE, PROJECT_STATUS } from "@/lib/labels";
import { CreateButton } from "@/components/crm/create-dialogs";
import { InlineField } from "@/components/crm/inline-field";
import { ProjectTeam } from "@/components/crm/project-team";
import { getProject } from "@/server/queries";
import { getViewer } from "@/server/session";

export default function ProjectPage(props: PageProps<"/progetti/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Project {...props} />
    </Suspense>
  );
}

async function Project({ params }: PageProps<"/progetti/[id]">) {
  const { id } = await params;
  const { viewer } = await getViewer();
  const data = await getProject(id, viewer);
  if (!data) notFound();
  const { p, company, owner, deal } = data;
  const open = data.tasks.filter((t) => t.status !== "fatto" && t.status !== "proposto");
  const proposed = data.tasks.filter((t) => t.status === "proposto");
  const done = data.tasks.filter((t) => t.status === "fatto");

  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb items={[{ label: "Progetti", href: "/progetti" }, { label: p.name }]} />} title={p.name} />
      <RecordHero
        avatar={<CompanyLogo name={company?.name ?? p.name} className="size-14 rounded-xl text-lg" />}
        title={p.name}
        subtitle={company ? <Link href={`/companies/${company.id}`} className="hover:text-foreground">{company.name}</Link> : "Interno"}
        chips={
          <>
            <HealthChip value={p.health} />
            <Chip>{PROJECT_STATUS[p.status]}</Chip>
            {p.dueOn ? <span className="text-xs text-muted-foreground">Consegna {formatDate(p.dueOn)}</span> : null}
          </>
        }
        actions={
          <>
            <CreateButton kind="interazione" defaults={{ projectId: p.id, companyId: p.companyId ?? undefined }} label="Interazione" />
            <CreateButton kind="task" defaults={{ projectId: p.id }} label="Task" variant="default" />
          </>
        }
      />
      <RecordLayout
        side={
          <>
            {p.agentSummary ? (
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
                <AgentMark label="Stato in breve" />
                <p className="text-sm">{p.agentSummary}</p>
                {p.healthNote ? <p className="text-xs text-muted-foreground">{p.healthNote}</p> : null}
              </div>
            ) : null}
            <SideBlock title="Descrizione">
              <InlineField entity="project" id={p.id} field="description" type="textarea" value={p.description} placeholder="Aggiungi una descrizione">
                <span className="whitespace-pre-wrap text-sm text-foreground/80">{p.description}</span>
              </InlineField>
            </SideBlock>
            <SideBlock title="Dati">
              <Attributes>
                <Attribute label="Nome">
                  <InlineField entity="project" id={p.id} field="name" value={p.name} nullable={false} />
                </Attribute>
                <Attribute label="Cliente">
                  <InlineField entity="project" id={p.id} field="companyId" type="company" value={p.companyId}>
                    {company?.name}
                  </InlineField>
                </Attribute>
                <Attribute label="Stato">
                  <InlineField
                    entity="project"
                    id={p.id}
                    field="status"
                    type="select"
                    nullable={false}
                    value={p.status}
                    options={Object.entries(PROJECT_STATUS).map(([v, l]) => ({ value: v, label: l }))}
                  >
                    {PROJECT_STATUS[p.status]}
                  </InlineField>
                </Attribute>
                <Attribute label="Salute">
                  <InlineField
                    entity="project"
                    id={p.id}
                    field="health"
                    type="select"
                    nullable={false}
                    value={p.health}
                    options={Object.entries(HEALTH).map(([v, o]) => ({ value: v, label: o.label }))}
                  >
                    <HealthChip value={p.health} />
                  </InlineField>
                </Attribute>
                <Attribute label="Deal d'origine">
                  {deal ? (
                    <Link href={`/pipeline/${deal.id}`} className="hover:underline">
                      {deal.name} · {formatEuro(deal.finalValue ?? deal.initialValue)}
                    </Link>
                  ) : null}
                </Attribute>
                <Attribute label="Inizio">
                  <InlineField entity="project" id={p.id} field="startOn" type="date" value={p.startOn}>
                    {p.startOn ? formatDate(p.startOn) : null}
                  </InlineField>
                </Attribute>
                <Attribute label="Consegna">
                  <InlineField entity="project" id={p.id} field="dueOn" type="date" value={p.dueOn}>
                    {p.dueOn ? `${formatDate(p.dueOn)}${relativeDay(p.dueOn) !== formatDate(p.dueOn) ? ` (${relativeDay(p.dueOn)})` : ""}` : null}
                  </InlineField>
                </Attribute>
                <Attribute label="Owner">
                  <InlineField entity="project" id={p.id} field="ownerId" type="user" value={p.ownerId}>
                    {owner?.name}
                  </InlineField>
                </Attribute>
                <Attribute label="Cartella Drive">
                  <InlineField entity="project" id={p.id} field="driveFolderUrl" type="url" value={p.driveFolderUrl}>
                    Cartella su Drive
                  </InlineField>
                </Attribute>
                <Attribute label="Team">
                  <ProjectTeam projectId={p.id} memberIds={data.team.map((u) => u.id)} />
                </Attribute>
              </Attributes>
            </SideBlock>
            {data.facts.length ? (
              <SideBlock title="Cosa sappiamo">
                <ul className="flex flex-col gap-2">
                  {data.facts.map((f) => (
                    <li key={f.id} className="text-sm">
                      {f.text}
                      <span className="block text-xs text-muted-foreground">{FACT_KIND[f.kind]}</span>
                    </li>
                  ))}
                </ul>
              </SideBlock>
            ) : null}
          </>
        }
      >
        <Tabs defaultValue="task" className="gap-4">
          <TabsList variant="line" className={lineTabsList}>
            <TabsTrigger value="task" className={lineTab}>Task {open.length}</TabsTrigger>
            <TabsTrigger value="meeting" className={lineTab}>Meeting {data.meetings.length}</TabsTrigger>
            <TabsTrigger value="timeline" className={lineTab}>Timeline</TabsTrigger>
          </TabsList>
          <TabsContent value="task" className="flex flex-col gap-6">
            {proposed.length ? (
              <section className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold">
                  Proposti dall&apos;agente <span className="text-xs font-normal text-muted-foreground">{proposed.length}</span>
                </h2>
                <TaskList tasks={proposed} />
              </section>
            ) : null}
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold">Da fare</h2>
              {open.length ? <TaskList tasks={open} /> : <EmptyState>Nessun task aperto.</EmptyState>}
            </section>
            {done.length ? (
              <section className="flex flex-col gap-2">
                <h2 className="text-[13px] font-semibold text-muted-foreground">Fatti</h2>
                <TaskList tasks={done} />
              </section>
            ) : null}
          </TabsContent>
          <TabsContent value="meeting">
            {data.meetings.length ? (
              <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
                {data.meetings.map((m) => (
                  <li key={m.id}>
                    <Link href={`/meeting/${m.id}`} className="flex items-start gap-3 px-3 py-3 hover:bg-muted/40">
                      {m.source === "nota_vocale" ? <Mic className="mt-0.5 size-4 text-muted-foreground" /> : <Users className="mt-0.5 size-4 text-muted-foreground" />}
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-medium">{m.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {MEETING_SOURCE[m.source]} · {relativeDay(m.occurredAt)} · {m.decisions.length} decisioni
                        </span>
                        {m.summary ? <p className="mt-1 line-clamp-2 text-sm text-foreground/80">{m.summary}</p> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Nessun meeting collegato.</EmptyState>
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
