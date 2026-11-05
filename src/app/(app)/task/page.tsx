import Link from "next/link";
import { Suspense } from "react";
import { CreateButton } from "@/components/crm/create-dialogs";
import { Chip } from "@/components/crm/chips";
import { EmptyState, PageHeader, PageSkeleton, Section } from "@/components/crm/page-header";
import { TaskCheckbox } from "@/components/crm/task-checkbox";
import { TaskTitle } from "@/components/crm/task-sheet";
import { relativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AvatarStack } from "@/components/crm/chips";
import { parseScope, ScopeToggle } from "@/components/crm/scope-toggle";
import { getTasks } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Task" };

export default function TasksPage(props: PageProps<"/task">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Tasks {...props} />
    </Suspense>
  );
}

const GROUPS = [
  { key: "in_ritardo", title: "In ritardo" },
  { key: "oggi", title: "Oggi" },
  { key: "settimana", title: "Questa settimana" },
  { key: "dopo", title: "Più avanti" },
] as const;

async function Tasks({ searchParams }: PageProps<"/task">) {
  const scope = parseScope((await searchParams).vista, "mine");
  const { viewer } = await getViewer();
  const groups = await getTasks(viewer, scope);
  const total = Object.values(groups).reduce((n, g) => n + g.length, 0);
  return (
    <>
      <PageHeader
        title="Task"
        description={scope === "mine" ? `${total} task aperti assegnati a te` : `${total} task aperti di tutto il team`}
        actions={
          <>
            <ScopeToggle path="/task" value={scope} fallback="mine" mine="I miei" />
            <CreateButton kind="task" variant="default" />
          </>
        }
      />
      <div className="flex max-w-4xl flex-col gap-8 p-4 md:p-6">
        {total === 0 ? <EmptyState>Nessun task aperto.</EmptyState> : null}
        {GROUPS.map(({ key, title }) => {
          const rows = groups[key];
          if (!rows.length) return null;
          return (
            <Section key={key} title={title} count={rows.length}>
              <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
                {rows.map(({ t, project, company, assignees, assigneeIds }) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                    <TaskCheckbox id={t.id} done={false} label={t.title} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <TaskTitle
                        className="truncate text-left text-sm hover:underline"
                        task={{
                          id: t.id,
                          title: t.title,
                          description: t.description,
                          status: t.status,
                          priority: t.priority,
                          dueOn: t.dueOn,
                          projectId: t.projectId,
                          parentId: t.parentId,
                          assigneeIds,
                        }}
                      >
                        {t.title}
                      </TaskTitle>
                      <span className="truncate text-xs text-muted-foreground">
                        {project ? (
                          <Link href={`/progetti/${project.id}`} className="hover:underline">
                            {project.name}
                          </Link>
                        ) : (
                          company?.name
                        )}
                      </span>
                    </div>
                    {t.priority === "alta" ? <Chip tone="bad">Alta</Chip> : null}
                    {scope === "team" ? (
                      <span className="hidden sm:flex">
                        {assignees.length ? <AvatarStack users={assignees} /> : <span className="text-xs text-muted-foreground">Nessuno</span>}
                      </span>
                    ) : null}
                    <span className={cn("w-20 shrink-0 text-right text-xs sm:w-24", key === "in_ritardo" ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                      {relativeDay(t.dueOn)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          );
        })}
      </div>
    </>
  );
}
