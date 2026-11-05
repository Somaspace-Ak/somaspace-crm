import { Button } from "@/components/ui/button";
import { relativeDay } from "@/lib/format";
import { todayInRome } from "@/lib/followup/dates";
import { cn } from "@/lib/utils";
import { acceptTask, discardTask } from "@/server/actions";
import type { ProjectTask } from "@/server/queries";
import { AgentMark, AvatarStack, Chip } from "./chips";
import { TaskCheckbox } from "./task-checkbox";
import { TaskTitle, type TaskSnapshot } from "./task-sheet";

export function TaskList({ tasks }: { tasks: ProjectTask[] }) {
  const today = todayInRome();
  return (
    <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
      {tasks.map((t) => (
        <li key={t.id} className="flex flex-col">
          <TaskRow task={t} today={today} />
          {t.subtasks.length ? (
            <ul className="border-t bg-muted/20">
              {t.subtasks.map((s) => (
                <TaskRow key={s.id} task={{ ...s, subtasks: [] }} today={today} nested />
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function TaskRow({ task: t, today, nested = false }: { task: ProjectTask; today: string; nested?: boolean }) {
  const done = t.status === "fatto";
  const late = !done && t.dueOn && t.dueOn < today;
  const proposed = t.status === "proposto";
  const subDone = t.subtasks.filter((s) => s.status === "fatto").length;

  return (
    <div className={cn("flex flex-wrap items-center gap-3 px-3 py-2.5", nested && "pl-10", proposed && "bg-violet-500/5")}>
      {proposed ? <span className="size-4" /> : <TaskCheckbox id={t.id} done={done} label={t.title} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <TaskTitle task={snapshot(t)} className={cn("text-left text-sm hover:underline", done && "text-muted-foreground line-through")}>
          {t.title}
        </TaskTitle>
        {proposed ? (
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <AgentMark label={t.origin === "meeting" ? "Dal meeting" : "Proposto"} />
            {t.rationale}
          </span>
        ) : t.subtasks.length ? (
          <span className="text-xs text-muted-foreground">
            {subDone} di {t.subtasks.length} sotto-task
          </span>
        ) : null}
      </div>
      {t.priority === "alta" && !done ? <Chip tone="bad">Alta</Chip> : null}
      <AvatarStack users={t.assignees} />
      <span className={cn("w-24 text-right text-xs tabular-nums", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
        {t.dueOn ? relativeDay(t.dueOn, today) : "—"}
      </span>
      {proposed ? (
        <div className="flex gap-1">
          <form action={acceptTask.bind(null, t.id)}>
            <Button size="sm" type="submit">
              Accetta
            </Button>
          </form>
          <form action={discardTask.bind(null, t.id)}>
            <Button size="sm" variant="ghost" type="submit">
              Scarta
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function snapshot(t: Omit<ProjectTask, "subtasks">): TaskSnapshot {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueOn: t.dueOn,
    projectId: t.projectId,
    parentId: t.parentId,
    assigneeIds: t.assignees.map((a) => a.id),
  };
}
