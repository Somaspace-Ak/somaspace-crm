import Link from "next/link";
import { Suspense } from "react";
import { ArrowDownLeft, CheckCheck, ChevronDown, ChevronRight, FileText, Flame, Lightbulb, ListChecks, Signal, Snowflake, Video } from "lucide-react";
import { AgentMark, Chip, CompanyLogo, StepBar, UserAvatar } from "@/components/crm/chips";
import { NewMenu } from "@/components/crm/header-tools";
import { EmptyState, PageHeader, PageSkeleton, SectionBar } from "@/components/crm/page-header";
import { QueueActions } from "@/components/crm/queue-actions";
import { TaskCheckbox } from "@/components/crm/task-checkbox";
import { formatEuro, formatTime, relativeDay } from "@/lib/format";
import { FACT_KIND, SUGGESTION_REASON } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { parseScope, ScopeToggle } from "@/components/crm/scope-toggle";
import type { FollowupSettings } from "@/lib/followup/engine";
import { countApprovals, getToday, type TodayEntry } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Oggi" };

export default function TodayPage(props: PageProps<"/">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Today {...props} />
    </Suspense>
  );
}

const SECTIONS: { key: TodayEntry["section"]; title: string; hint: string; icon: React.ReactNode }[] = [
  { key: "ti_hanno_scritto", title: "Ti hanno scritto", hint: "aspettano una tua risposta", icon: <ArrowDownLeft className="size-4 text-muted-foreground" aria-hidden /> },
  { key: "preventivi", title: "Preventivi da seguire", hint: "sequenza", icon: <FileText className="size-4 text-muted-foreground" aria-hidden /> },
  { key: "caldi", title: "Caldi da sentire", hint: "cadenza caldi", icon: <Flame className="size-4 text-hot" aria-hidden /> },
  { key: "freddi", title: "Freddi da sentire", hint: "cadenza freddi", icon: <Snowflake className="size-4 text-cold" aria-hidden /> },
  { key: "lead_fermi", title: "Lead fermi", hint: "promemoria interno, senza bozza", icon: <Signal className="size-4 text-muted-foreground" aria-hidden /> },
];

/** Quante voci mostrare per sezione prima di "Mostra tutte". */
const PREVIEW = 8;

const longDay = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });

async function Today({ searchParams }: PageProps<"/">) {
  const { vista, tutte } = await searchParams;
  const scope = parseScope(vista, "mine");
  const { viewer } = await getViewer();
  const [data, approvals] = await Promise.all([getToday(viewer, scope), countApprovals()]);
  const total = data.entries.length;
  const lateTotal = data.entries.filter((e) => e.daysLate > 0).length;
  const wrote = data.entries.filter((e) => e.section === "ti_hanno_scritto").length;
  const firstName = viewer.name.split(" ")[0];
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (scope === "team") p.set("vista", "team");
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/?${q}` : "/";
  };

  const summary = [
    ...SECTIONS.map((s) => {
      const items = data.entries.filter((e) => e.section === s.key);
      return { id: s.key, label: s.title.replace(" da seguire", "").replace(" da sentire", ""), n: items.length, late: items.filter((e) => e.daysLate > 0).length };
    }),
    { id: "task", label: "Task in scadenza", n: data.tasks.length, late: data.tasks.filter(({ t }) => t.dueOn && t.dueOn < data.today).length },
    { id: "meeting", label: "Meeting", n: data.briefings.length, late: 0 },
  ];

  return (
    <>
      <PageHeader
        title="Oggi"
        description={<span className="first-letter:uppercase">{longDay.format(new Date(`${data.today}T12:00:00Z`))}</span>}
        actions={<NewMenu />}
      />

      <div className="flex w-full max-w-[1240px] flex-col gap-6 px-4 pt-7 pb-16 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[28px] leading-[34px] font-bold tracking-[-0.025em]">Buongiorno, {firstName}.</h2>
            <p className="text-muted-foreground">
              {total === 0
                ? "Niente in coda per oggi."
                : `${total} ${total === 1 ? "cosa" : "cose"} per oggi${lateTotal ? `, ${lateTotal} in ritardo` : ""}.${wrote ? ` ${wrote === 1 ? "Una persona ti ha" : `${wrote} persone ti hanno`} scritto.` : ""}`}
            </p>
          </div>
          <ScopeToggle path="/" value={scope} fallback="mine" mine="La mia coda" />
        </div>

        <nav aria-label="Riepilogo della coda" className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2">
          {summary.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={cn("flex flex-col gap-1 rounded-[10px] border bg-card px-3.5 py-3 hover:bg-muted", !s.n && "opacity-55")}>
              <span className="truncate text-xs text-muted-foreground">{s.label}</span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-[22px] leading-7 font-semibold tabular-nums">{s.n}</span>
                {s.late ? <span className="text-xs text-bad tabular-nums">{s.late} in ritardo</span> : null}
              </span>
            </a>
          ))}
        </nav>

        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-[10px] border bg-card">
            {total === 0 && !data.tasks.length ? (
              <div className="p-6">
                <EmptyState>Niente da fare oggi. Il digest di domattina non partirà.</EmptyState>
              </div>
            ) : null}

            {SECTIONS.map((s) => {
              const items = data.entries.filter((e) => e.section === s.key);
              if (!items.length) return null;
              const open = tutte === s.key;
              const shown = open ? items : items.slice(0, PREVIEW);
              const late = items.filter((e) => e.daysLate > 0).length;
              return (
                <section key={s.key} id={s.key} className="scroll-mt-20">
                  <SectionBar
                    icon={s.icon}
                    title={s.title}
                    count={items.length}
                    extra={
                      <>
                        {late ? <span className="inline-flex h-[18px] items-center rounded-full bg-bad-bg px-1.5 text-[11px] font-semibold text-bad">{late} in ritardo</span> : null}
                        <span className="hidden text-xs text-muted-foreground sm:inline">{hintFor(s.key, data.settings)}</span>
                      </>
                    }
                  />
                  <ul>
                    {shown.map((e) => (
                      <QueueRow key={`${e.kind}-${e.id}`} e={e} showOwner={scope === "team"} />
                    ))}
                  </ul>
                  {items.length > PREVIEW ? (
                    <Link
                      href={href({ tutte: open ? undefined : s.key }) + `#${s.key}`}
                      className="flex h-10 items-center justify-center gap-1.5 border-b text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {open ? "Mostra meno" : `Mostra altre ${items.length - PREVIEW}`}
                      <ChevronDown className={cn("size-3", open && "rotate-180")} aria-hidden />
                    </Link>
                  ) : null}
                </section>
              );
            })}

            <section id="task" className="scroll-mt-20">
              <SectionBar
                icon={<ListChecks className="size-4 text-muted-foreground" aria-hidden />}
                title="Task in scadenza"
                count={data.tasks.length}
                extra={
                  <Link href="/task" className="text-xs text-muted-foreground hover:text-foreground">
                    Tutti i task
                  </Link>
                }
              />
              {data.tasks.length ? (
                <ul>
                  {data.tasks.map(({ t, project }) => {
                    const late = t.dueOn && t.dueOn < data.today;
                    const today = t.dueOn === data.today;
                    return (
                      <li key={t.id} className="flex min-h-11 items-center gap-3 border-b px-4 py-2 hover:bg-muted">
                        <TaskCheckbox id={t.id} done={t.status === "fatto"} label={t.title} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{t.title}</span>
                        {project ? (
                          <Link href={`/progetti/${project.id}`} className="hidden max-w-[220px] truncate rounded-full border px-2 py-0.5 text-xs hover:bg-accent sm:inline">
                            {project.name}
                          </Link>
                        ) : null}
                        <Chip tone={late ? "bad" : today ? "warn" : "neutral"} className="h-5 min-w-[84px] justify-center">
                          {late ? `${relativeDay(t.dueOn, data.today)}` : today ? "Oggi" : relativeDay(t.dueOn, data.today)}
                        </Chip>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 py-4 text-[13px] text-muted-foreground">Nessun task in scadenza nei prossimi due giorni.</p>
              )}
            </section>
          </div>

          <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-6">
            <section id="meeting" className="flex scroll-mt-20 flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <Video className="size-4 text-muted-foreground" aria-hidden />
                <h3 className="text-sm font-semibold">Meeting di oggi</h3>
                <span className="inline-flex h-[18px] min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-semibold">{data.briefings.length}</span>
              </div>
              {data.briefings.length ? (
                data.briefings.map((b) => (
                  <article key={b.meeting.id} className="overflow-hidden rounded-[10px] border bg-card">
                    <div className="flex items-center gap-3 border-b px-3.5 py-3">
                      <span className="flex h-10 w-12 items-center justify-center rounded-lg bg-secondary text-[13px] font-semibold tabular-nums">
                        {formatTime(b.meeting.occurredAt)}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13px] font-semibold">{b.meeting.title}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[b.company?.name, b.participants.join(", ")].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5 px-3.5 py-3">
                      <AgentMark label="Briefing" />
                      <div className="grid grid-cols-[84px_1fr] gap-x-2.5 gap-y-1.5 text-[13px]">
                        {b.openDeals.map((d) => (
                          <BriefRow key={d.name} label="Deal aperto">
                            {d.name} · {formatEuro(d.value)}
                          </BriefRow>
                        ))}
                        {b.facts.map((f) => (
                          <BriefRow key={f.id} label={FACT_KIND[f.kind]}>
                            {f.text}
                          </BriefRow>
                        ))}
                        {b.openTasks ? <BriefRow label="Task aperti">{b.openTasks} sui progetti del cliente</BriefRow> : null}
                      </div>
                      {b.company ? (
                        <Link href={`/companies/${b.company.id}`} className="inline-flex h-7 items-center self-start rounded-md border px-2.5 text-xs font-medium hover:bg-accent">
                          Apri scheda
                        </Link>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState>Nessun meeting con clienti oggi.</EmptyState>
              )}
            </section>

            {data.signals.length ? (
              <section className="flex flex-col gap-2.5">
                <h3 className="text-sm font-semibold">Segnali da riprendere</h3>
                {data.signals.map(({ f, company }) => (
                  <div key={f.id} className="flex flex-col gap-2 rounded-[10px] border bg-card p-3.5">
                    <AgentMark label={`Da riprendere ${relativeDay(f.resurfaceOn, data.today)}`} />
                    <p className="text-[13px]">{f.text}</p>
                    {company ? (
                      <Link href={`/companies/${company.id}`} className="text-xs text-muted-foreground hover:text-foreground">
                        {company.name}
                      </Link>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}

            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <Lightbulb className="size-4 text-muted-foreground" aria-hidden />
                <h3 className="text-sm font-semibold">Opportunità suggerite</h3>
                <Link href="/opportunita" className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                  Tutte
                </Link>
              </div>
              {data.suggestions.length ? null : <EmptyState>Nessuna opportunità suggerita per ora.</EmptyState>}
              {data.suggestions.map(({ s, company }) => (
                <Link key={s.id} href="/opportunita" className="flex flex-col gap-2 rounded-[10px] border bg-card p-3.5 hover:bg-muted">
                  <span className="flex items-center gap-2">
                    <AgentMark />
                    <span className="text-xs text-muted-foreground">{SUGGESTION_REASON[s.reason]}</span>
                  </span>
                  <span className="text-[13px] font-semibold">{company.name}</span>
                  <span className="text-[13px] text-muted-foreground">{s.rationale}</span>
                </Link>
              ))}
            </section>

            {approvals ? (
              <Link href="/da-approvare" className="flex items-center gap-3 rounded-[10px] border bg-card p-3.5 hover:bg-muted">
                <span className="flex size-7 items-center justify-center rounded-md bg-brand-bg text-brand">
                  <CheckCheck className="size-4" aria-hidden />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-[13px] font-semibold">
                    {approvals} {approvals === 1 ? "proposta" : "proposte"} da approvare
                  </span>
                  <span className="text-xs text-muted-foreground">Contatti, task e cambi di modalità</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}

function hintFor(section: TodayEntry["section"], s: FollowupSettings) {
  switch (section) {
    case "ti_hanno_scritto":
      return "aspettano una tua risposta";
    case "preventivi":
      return `passi a ${s.quoteSequence.join(", ")} giorni`;
    case "caldi":
      return `cadenza ${s.warmDays} giorni`;
    case "freddi":
      return `cadenza ${s.coldDays} giorni`;
    case "lead_fermi":
      return "promemoria interno, senza bozza";
  }
}

function BriefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="pt-px text-xs text-muted-foreground">{label}</span>
      <span>{children}</span>
    </>
  );
}

function QueueRow({ e, showOwner }: { e: TodayEntry; showOwner: boolean }) {
  const late = e.daysLate > 0;
  return (
    <li className="flex min-h-14 flex-col gap-2 border-b px-4 py-2.5 hover:bg-muted sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {e.kind === "opportunita" ? (
          <CompanyLogo name={e.companyName ?? e.title} />
        ) : (
          <UserAvatar initials={e.title.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px]">
            <Link href={e.href} className="font-semibold hover:underline">
              {e.title}
            </Link>{" "}
            <span className="text-muted-foreground">· {e.subtitle}</span>
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {e.reason}
            {e.value ? ` · ${formatEuro(e.value)}` : ""}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 pl-9 sm:pl-0">
        {e.section === "preventivi" && e.step ? (
          <span className="hidden w-24 flex-col gap-1 md:flex">
            <StepBar step={Math.min(e.step, 4)} />
          </span>
        ) : null}
        {showOwner && e.ownerName ? <UserAvatar initials={e.ownerName.split(" ").map((w) => w[0]).join("").slice(0, 2)} name={e.ownerName} /> : null}
        {e.section === "ti_hanno_scritto" ? (
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{e.daysLate === 0 ? "oggi" : e.daysLate === 1 ? "ieri" : `${e.daysLate} g fa`}</span>
        ) : (
          <Chip tone={late ? "bad" : "warn"} className="h-5 min-w-[76px] justify-center tabular-nums">
            {late ? `${e.daysLate} g` : "Oggi"}
          </Chip>
        )}
        <div className="ml-auto sm:ml-0">
          <QueueActions kind={e.kind} id={e.id} href={e.href} hasDraft={e.hasDraft} askOutcome={e.askOutcome} />
        </div>
      </div>
    </li>
  );
}
