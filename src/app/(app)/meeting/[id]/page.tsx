import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2, ChevronRight, FileText, Sparkles, Video } from "lucide-react";
import { AgentMark } from "@/components/crm/chips";
import { InlineField } from "@/components/crm/inline-field";
import { PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { Attribute, Attributes, Breadcrumb, RecordLayout, SideBlock } from "@/components/crm/record";
import { TaskList } from "@/components/crm/task-list";
import { formatDate, formatTime, fullName } from "@/lib/format";
import { MEETING_SOURCE } from "@/lib/labels";
import { getMeeting } from "@/server/queries";
import { getViewer } from "@/server/session";

export default function MeetingPage(props: PageProps<"/meeting/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Meeting {...props} />
    </Suspense>
  );
}

const DOC_ICON = { registrazione: Video, trascrizione: FileText, note: Sparkles, altro: FileText } as const;
const DOC_LABEL = { registrazione: "Registrazione", trascrizione: "Trascrizione", note: "Note di Gemini", altro: "" } as const;

async function Meeting({ params }: PageProps<"/meeting/[id]">) {
  const { id } = await params;
  const { viewer } = await getViewer();
  const data = await getMeeting(id, viewer);
  if (!data) notFound();
  const { m, company, project, owner } = data;
  const waitingDocs = m.docs.some((d) => d.kind === "note" || d.kind === "trascrizione") && !m.notes && !m.transcript;

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: "Meeting", href: "/meeting" }, { label: m.title }]} />}
        title={m.title}
        description={`${formatDate(m.occurredAt)} alle ${formatTime(m.occurredAt)} · ${MEETING_SOURCE[m.source]}`}
      />
      <RecordLayout
        side={
          <>
            <SideBlock title="Dettagli">
              <Attributes>
                <Attribute label="Quando">
                  {formatDate(m.occurredAt)}, {formatTime(m.occurredAt)}
                  {m.endsAt ? `–${formatTime(m.endsAt)}` : ""}
                </Attribute>
                <Attribute label="Cliente">
                  <InlineField entity="meeting" id={m.id} field="companyId" type="company" value={m.companyId} placeholder="Collega un cliente">
                    {company ? (
                      <Link href={`/companies/${company.id}`} className="hover:underline">
                        {company.name}
                      </Link>
                    ) : null}
                  </InlineField>
                </Attribute>
                <Attribute label="Progetto">
                  <InlineField entity="meeting" id={m.id} field="projectId" type="project" value={m.projectId} placeholder="Collega un progetto">
                    {project ? (
                      <Link href={`/progetti/${project.id}`} className="hover:underline">
                        {project.name}
                      </Link>
                    ) : null}
                  </InlineField>
                </Attribute>
                <Attribute label="Chi lo vede">
                  <InlineField
                    entity="meeting"
                    id={m.id}
                    field="visibility"
                    type="select"
                    nullable={false}
                    value={m.visibility}
                    options={[
                      { value: "team", label: "Tutto il team" },
                      { value: "privata", label: "Solo chi c'era" },
                    ]}
                  >
                    {m.visibility === "team" ? "Tutto il team" : "Solo chi c'era"}
                  </InlineField>
                </Attribute>
                <Attribute label="Partecipanti">
                  <ul className="flex flex-col gap-0.5">
                    {data.participants.map((x, i) => (
                      <li key={i}>
                        {x.person ? (
                          <Link href={`/people/${x.person.id}`} className="hover:underline">
                            {fullName(x.person)}
                          </Link>
                        ) : x.user ? (
                          `${x.user.name} (Somaspace)`
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Attribute>
                <Attribute label="Registrato da">{owner?.name}</Attribute>
              </Attributes>
            </SideBlock>
            {m.docs.length ? (
              <SideBlock title="File di Meet">
                <ul className="flex flex-col gap-1">
                  {m.docs.map((d) => {
                    const Icon = DOC_ICON[d.kind];
                    return (
                      <li key={d.url}>
                        <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent">
                          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{DOC_LABEL[d.kind] || d.title}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </SideBlock>
            ) : null}
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
            <AgentMark label="Recap" />
            <InlineField
              entity="meeting"
              id={m.id}
              field="summary"
              type="textarea"
              value={m.summary}
              placeholder={
                data.upcoming
                  ? "Meeting non ancora fatto"
                  : waitingDocs
                    ? "Le note di Gemini arrivano da Drive al prossimo giro (ogni 30 minuti)"
                    : "Nessun recap: scrivilo tu, o attiva le note di Gemini nei prossimi meeting"
              }
            >
              {m.summary ? <p className="text-sm whitespace-pre-line">{m.summary}</p> : null}
            </InlineField>
          </section>
          {m.decisions.length ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold">Decisioni</h2>
              <ul className="flex flex-col gap-1.5">
                {m.decisions.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" aria-hidden />
                    {d}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {m.nextSteps.length ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold">Prossimi passi</h2>
              <ul className="flex flex-col gap-1.5">
                {m.nextSteps.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-sm">
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {d}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {data.tasks.length ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold">Task nati da questo meeting</h2>
              <TaskList tasks={data.tasks.map((t) => ({ ...t, assignees: [], subtasks: [] }))} />
            </section>
          ) : null}
          {m.notes ? (
            <details className="rounded-lg border">
              <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">Note di Gemini complete</summary>
              <pre className="max-h-[60vh] overflow-y-auto border-t px-3 py-3 font-sans text-sm whitespace-pre-wrap text-foreground/80">{m.notes}</pre>
            </details>
          ) : null}
          {m.transcript ? (
            <details className="rounded-lg border">
              <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">Trascrizione completa</summary>
              <pre className="max-h-[60vh] overflow-y-auto border-t px-3 py-3 font-sans text-sm whitespace-pre-wrap text-foreground/80">{m.transcript}</pre>
            </details>
          ) : null}
        </div>
      </RecordLayout>
    </>
  );
}
