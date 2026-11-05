import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { AgentMark, Chip, PrivateMark } from "@/components/crm/chips";
import { PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { Attribute, Attributes, RecordLayout, SideBlock } from "@/components/crm/record";
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

async function Meeting({ params }: PageProps<"/meeting/[id]">) {
  const { id } = await params;
  const { viewer } = await getViewer();
  const data = await getMeeting(id, viewer);
  if (!data) notFound();
  const { m, company, project, owner } = data;

  return (
    <>
      <PageHeader title={m.title} description={`${formatDate(m.occurredAt)} alle ${formatTime(m.occurredAt)} · ${MEETING_SOURCE[m.source]}`} />
      <RecordLayout
        side={
          <SideBlock title="Dettagli">
            <Attributes>
              <Attribute label="Cliente">
                {company ? (
                  <Link href={`/companies/${company.id}`} className="hover:underline">
                    {company.name}
                  </Link>
                ) : null}
              </Attribute>
              <Attribute label="Progetto">
                {project ? (
                  <Link href={`/progetti/${project.id}`} className="hover:underline">
                    {project.name}
                  </Link>
                ) : null}
              </Attribute>
              <Attribute label="Partecipanti">
                <ul className="flex flex-col gap-0.5">
                  {data.participants.map((x, i) => (
                    <li key={i}>{x.person ? fullName(x.person) : x.user ? `${x.user.name} (Somaspace)` : null}</li>
                  ))}
                </ul>
              </Attribute>
              <Attribute label="Caricato da">{owner?.name}</Attribute>
            </Attributes>
          </SideBlock>
        }
      >
        <div className="flex flex-col gap-6">
          {m.summary ? (
            <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
              <AgentMark label="Sintesi" />
              <p className="text-sm">{m.summary}</p>
            </section>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Meeting non ancora avvenuto. La sintesi arriva quando la trascrizione è pronta su Drive.
            </p>
          )}
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
                    <ChevronRight className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
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
          {m.transcript ? (
            <details className="rounded-lg border">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-medium">
                Trascrizione completa <PrivateMark />
              </summary>
              <pre className="border-t px-3 py-3 font-sans text-sm whitespace-pre-wrap text-foreground/80">{m.transcript}</pre>
            </details>
          ) : m.source !== "manuale" ? (
            <Chip>La trascrizione è visibile solo a chi ha caricato il meeting</Chip>
          ) : null}
        </div>
      </RecordLayout>
    </>
  );
}
