import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { parseScope, ScopeToggle } from "@/components/crm/scope-toggle";
import { TaskTitle } from "@/components/crm/task-sheet";
import { addDays, todayInRome, toRomeDate } from "@/lib/followup/dates";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCalendar } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Calendario" };

export default function CalendarPage(props: PageProps<"/calendario">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Calendar {...props} />
    </Suspense>
  );
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const monthTitle = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
const dayTitle = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
/** Quante voci mostrare in una cella prima di "+N altre". */
const PER_CELL = 4;

type Item =
  | { kind: "task"; key: string; date: string; label: string; done: boolean; snapshot: Parameters<typeof TaskTitle>[0]["task"]; hint: string }
  | { kind: "progetto"; key: string; date: string; label: string; href: string; hint: string }
  | { kind: "meeting"; key: string; date: string; label: string; href: string; time: string; hint: string }
  | { kind: "evento"; key: string; date: string; label: string; href: string | null; time: string | null; meet: boolean; hint: string };

function parseMonth(v: unknown, today: string) {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : today.slice(0, 7);
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Lunedì = 0 */
const weekday = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

async function Calendar({ searchParams }: PageProps<"/calendario">) {
  const sp = await searchParams;
  const scope = parseScope(sp.vista, "mine");
  const { viewer } = await getViewer();
  const today = todayInRome();
  const month = parseMonth(sp.mese, today);
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  // Settimane intere, da lunedì a domenica
  const start = addDays(first, -weekday(first));
  const end = addDays(last, 6 - weekday(last));
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const data = await getCalendar(viewer, scope, start, end);
  const items: Item[] = [
    ...data.events.map(({ e, company, owner }) => ({
      kind: "evento" as const,
      key: `e-${e.id}`,
      date: e.allDay ? e.startsAt.toISOString().slice(0, 10) : toRomeDate(e.startsAt),
      label: e.title,
      href: e.meetLink ?? e.htmlLink,
      time: e.allDay ? null : formatTime(e.startsAt),
      meet: Boolean(e.meetLink),
      hint: [company?.name, owner.id !== viewer.id ? owner.name.split(" ")[0] : null, e.meetLink ? "Google Meet" : null].filter(Boolean).join(" · "),
    })),
    ...data.meetings.map(({ m, company }) => ({
      kind: "meeting" as const,
      key: `m-${m.id}`,
      date: toRomeDate(m.occurredAt),
      label: m.title,
      href: `/meeting/${m.id}`,
      time: formatTime(m.occurredAt),
      hint: company?.name ?? "Meeting",
    })),
    ...data.projects.map(({ p, company }) => ({
      kind: "progetto" as const,
      key: `p-${p.id}`,
      date: p.dueOn!,
      label: `Consegna: ${p.name}`,
      href: `/progetti/${p.id}`,
      hint: company?.name ?? "Progetto",
    })),
    ...data.tasks.map(({ t, project, assignees }) => ({
      kind: "task" as const,
      key: `t-${t.id}`,
      date: t.dueOn!,
      label: t.title,
      done: t.status === "fatto",
      hint: [project?.name, assignees.map((u) => u.name.split(" ")[0]).join(", ")].filter(Boolean).join(" · "),
      snapshot: {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueOn: t.dueOn,
        projectId: t.projectId,
        parentId: t.parentId,
        assigneeIds: assignees.map((u) => u.id),
      },
    })),
  ];
  const byDay = new Map<string, Item[]>();
  for (const it of items) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);

  const q = (m: string) => `/calendario?mese=${m}${scope === "team" ? "&vista=team" : ""}`;
  const counts = {
    task: data.tasks.filter((r) => r.t.status !== "fatto").length,
    progetti: data.projects.length,
    meeting: data.meetings.length + data.events.length,
  };

  return (
    <>
      <PageHeader
        title="Calendario"
        description={`${counts.task} task aperti, ${counts.progetti} consegne, ${counts.meeting} meeting`}
        actions={<ScopeToggle path={`/calendario?mese=${month}`} value={scope} fallback="mine" mine="I miei" />}
      />
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-lg font-semibold first-letter:uppercase">{monthTitle.format(new Date(`${first}T12:00:00Z`))}</h2>
          <Button asChild variant="outline" size="icon-sm">
            <Link href={q(shiftMonth(month, -1))} aria-label="Mese precedente">
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon-sm">
            <Link href={q(shiftMonth(month, 1))} aria-label="Mese successivo">
              <ChevronRight aria-hidden />
            </Link>
          </Button>
          {month !== today.slice(0, 7) ? (
            <Button asChild variant="outline" size="sm">
              <Link href={q(today.slice(0, 7))}>Oggi</Link>
            </Button>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Legend className="bg-foreground/70">Task</Legend>
            <Legend className="bg-brand">Consegna progetto</Legend>
            <Legend className="bg-cold">Meeting</Legend>
            <Legend className="bg-ok">Google Calendar</Legend>
          </div>
        </div>

        {/* Mese a griglia da tablet in su */}
        <div className="hidden overflow-hidden rounded-[10px] border bg-card md:block">
          <div className="grid grid-cols-7 border-b bg-muted text-xs font-medium text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const list = byDay.get(d) ?? [];
              const outside = !d.startsWith(month);
              return (
                <div
                  key={d}
                  className={cn(
                    "flex min-h-28 min-w-0 flex-col gap-0.5 border-b p-1.5",
                    i % 7 !== 6 && "border-r",
                    outside && "bg-muted/40",
                    i >= days.length - 7 && "border-b-0",
                  )}
                >
                  <span
                    className={cn(
                      "mb-0.5 inline-flex size-6 items-center justify-center self-end rounded-full text-xs tabular-nums",
                      d === today ? "bg-primary font-semibold text-primary-foreground" : outside ? "text-muted-foreground/60" : "text-muted-foreground",
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                  {list.slice(0, PER_CELL).map((it) => (
                    <CalendarItem key={it.key} item={it} today={today} compact />
                  ))}
                  {list.length > PER_CELL ? (
                    <span className="px-1 text-[11px] text-muted-foreground" title={list.slice(PER_CELL).map((x) => x.label).join("\n")}>
                      +{list.length - PER_CELL} altre
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Agenda sul telefono: solo i giorni con qualcosa */}
        <div className="flex flex-col gap-4 md:hidden">
          {days.filter((d) => d.startsWith(month) && byDay.has(d)).length === 0 ? (
            <p className="rounded-[10px] border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Niente in calendario questo mese.</p>
          ) : null}
          {days
            .filter((d) => d.startsWith(month) && byDay.has(d))
            .map((d) => (
              <section key={d} className="flex flex-col gap-1.5">
                <h3 className={cn("text-xs font-medium first-letter:uppercase", d === today ? "text-foreground" : "text-muted-foreground")}>
                  {dayTitle.format(new Date(`${d}T12:00:00Z`))}
                  {d === today ? " · oggi" : ""}
                </h3>
                <div className="flex flex-col gap-1 rounded-[10px] border bg-card p-2">
                  {byDay.get(d)!.map((it) => (
                    <CalendarItem key={it.key} item={it} today={today} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      </div>
    </>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} aria-hidden />
      {children}
    </span>
  );
}

function CalendarItem({ item, today, compact }: { item: Item; today: string; compact?: boolean }) {
  const base = cn(
    "flex w-full min-w-0 items-center gap-1.5 rounded px-1 text-left hover:bg-accent",
    compact ? "py-0.5 text-[11.5px] leading-4" : "py-1 text-[13px]",
  );
  const label = (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{item.label}</span>
      {!compact && item.hint ? <span className="truncate text-xs text-muted-foreground">{item.hint}</span> : null}
    </span>
  );
  if (item.kind === "task") {
    const late = !item.done && item.date < today;
    return (
      <TaskTitle task={item.snapshot} className={cn(base, item.done && "text-muted-foreground line-through", late && "text-bad")}>
        <span className={cn("size-1.5 shrink-0 rounded-full", late ? "bg-bad" : "bg-foreground/70")} aria-hidden />
        <span className="sr-only">Task{late ? " in ritardo" : ""}: </span>
        {label}
      </TaskTitle>
    );
  }
  if (item.kind === "evento") {
    const body = (
      <>
        <span className="size-1.5 shrink-0 rounded-full bg-ok" aria-hidden />
        {item.time ? <span className="shrink-0 text-muted-foreground tabular-nums">{item.time}</span> : null}
        {item.meet ? <Video className="size-3 shrink-0 text-ok" aria-label="Google Meet" /> : null}
        {label}
      </>
    );
    return item.href ? (
      <a href={item.href} target="_blank" rel="noreferrer" className={base} title={item.hint}>
        {body}
      </a>
    ) : (
      <span className={base} title={item.hint}>
        {body}
      </span>
    );
  }
  return (
    <Link href={item.href} className={base} title={item.hint}>
      <span className={cn("size-1.5 shrink-0 rounded-full", item.kind === "meeting" ? "bg-cold" : "bg-brand")} aria-hidden />
      {item.kind === "meeting" ? <span className="shrink-0 text-muted-foreground tabular-nums">{item.time}</span> : null}
      {label}
    </Link>
  );
}
