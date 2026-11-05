"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate } from "@/lib/format";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { deleteTask, setTaskAssignees } from "@/server/mutations";
import { MultiPicker } from "./combobox";
import { openCreate } from "./create-dialogs";
import { useFormOptions } from "./form-options";
import { InlineField } from "./inline-field";

export type TaskSnapshot = {
  id: string;
  title: string;
  description: string | null;
  status: keyof typeof TASK_STATUS;
  priority: keyof typeof PRIORITY;
  dueOn: string | null;
  projectId: string | null;
  parentId: string | null;
  assigneeIds: string[];
};

const EVENT = "crm:open-task";

export function openTask(task: TaskSnapshot) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: task }));
}

/** Il titolo di un task: aprirlo mostra il pannello di modifica. */
export function TaskTitle({ task, className, children }: { task: TaskSnapshot; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => openTask(task)} className={className ?? "text-left hover:underline"}>
      {children}
    </button>
  );
}

/** Pannello laterale per modificare un task: montato una volta nel layout. */
export function TaskSheet() {
  const [task, setTask] = useState<TaskSnapshot | null>(null);
  const [pending, start] = useTransition();
  const lists = useFormOptions();

  useEffect(() => {
    const onOpen = (e: Event) => setTask((e as CustomEvent<TaskSnapshot>).detail);
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  if (!task) return null;
  const patch = (field: keyof TaskSnapshot) => (value: unknown) => setTask((t) => (t ? { ...t, [field]: value } : t));
  const users = lists.users.map((u) => ({ value: u.id, label: u.name }));
  const projectName = lists.projects.find((p) => p.id === task.projectId)?.name;

  return (
    <Sheet open onOpenChange={(o) => !o && setTask(null)}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="sr-only">Modifica task</SheetTitle>
          <SheetDescription className="sr-only">Ogni modifica si salva subito</SheetDescription>
          <InlineField entity="task" id={task.id} field="title" value={task.title} nullable={false} onSaved={patch("title")} className="text-base font-semibold" />
        </SheetHeader>
        <dl className="flex flex-col gap-1 p-4 text-[13px]">
          <Row label="Stato">
            <InlineField
              entity="task"
              id={task.id}
              field="status"
              type="select"
              nullable={false}
              value={task.status}
              options={Object.entries(TASK_STATUS).map(([v, o]) => ({ value: v, label: o.label }))}
              onSaved={patch("status")}
            >
              {TASK_STATUS[task.status].label}
            </InlineField>
          </Row>
          <Row label="Priorità">
            <InlineField
              entity="task"
              id={task.id}
              field="priority"
              type="select"
              nullable={false}
              value={task.priority}
              options={Object.entries(PRIORITY).map(([v, o]) => ({ value: v, label: o.label }))}
              onSaved={patch("priority")}
            >
              {PRIORITY[task.priority].label}
            </InlineField>
          </Row>
          <Row label="Scadenza">
            <InlineField entity="task" id={task.id} field="dueOn" type="date" value={task.dueOn} onSaved={patch("dueOn")}>
              {task.dueOn ? formatDate(task.dueOn) : null}
            </InlineField>
          </Row>
          <Row label="Progetto">
            <InlineField entity="task" id={task.id} field="projectId" type="project" value={task.projectId} onSaved={patch("projectId")}>
              {projectName ?? (task.projectId ? "Progetto chiuso" : null)}
            </InlineField>
          </Row>
          <Row label="Assegnato a">
            <MultiPicker
              options={users}
              value={task.assigneeIds}
              onChange={(ids) => {
                patch("assigneeIds")(ids);
                start(async () => {
                  const res = await setTaskAssignees(task.id, ids);
                  if (!res.ok) toast.error(res.error);
                });
              }}
            />
          </Row>
          <div className="mt-3 flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Descrizione</dt>
            <dd>
              <InlineField entity="task" id={task.id} field="description" type="textarea" value={task.description} placeholder="Aggiungi una descrizione" onSaved={patch("description")}>
                <span className="whitespace-pre-wrap">{task.description}</span>
              </InlineField>
            </dd>
          </div>
        </dl>
        <div className="mt-auto flex items-center gap-2 border-t p-4">
          {task.parentId ? null : (
            <Button size="sm" variant="outline" onClick={() => openCreate("task", { projectId: task.projectId ?? undefined, parentId: task.id })}>
              <Plus aria-hidden />
              Sotto-task
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteTask(task.id);
                if (res.ok) {
                  toast.success("Task eliminato");
                  setTask(null);
                } else toast.error(res.error);
              })
            }
          >
            <Trash2 aria-hidden />
            Elimina
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
