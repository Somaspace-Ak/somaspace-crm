import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  agentLog,
  companies,
  excludedAddresses,
  settings,
  events,
  facts,
  grants,
  interactionPeople,
  interactions,
  meetingParticipants,
  meetings,
  opportunities,
  people,
  projectMembers,
  projects,
  services,
  suggestions,
  taskAssignees,
  tasks,
  users,
} from "@/db/schema";
import { addDays, todayInRome, toRomeDate } from "@/lib/followup/dates";
import { buildTodayQueue, pickDrafts, type FollowupSettings, type QueueItem } from "@/lib/followup/engine";
import { fullName } from "@/lib/format";
import { loadFollowupInputs, loadFollowupSettings } from "./followups";
import { ensureFreshSuggestions, loadSuggestionSettings } from "./suggestions";
import type { User } from "./session";

// ---------------------------------------------------------------------------
// Visibilità: le email restano di chi le ha ricevute o inviate
// ---------------------------------------------------------------------------

function visibleTo(viewer: User) {
  return or(eq(interactions.visibility, "team"), eq(interactions.ownerId, viewer.id));
}

const owners = alias(users, "owner");

// ---------------------------------------------------------------------------
// Oggi
// ---------------------------------------------------------------------------

export type TodayEntry = QueueItem & {
  title: string;
  subtitle: string;
  companyId: string | null;
  companyName: string | null;
  ownerName: string | null;
  ownerId: string | null;
  value: number | null;
  reason: string;
  hasDraft: boolean;
  href: string;
};

function reasonFor(i: QueueItem, s: FollowupSettings) {
  switch (i.section) {
    case "ti_hanno_scritto":
      return `Ti ha scritto ${i.daysLate === 0 ? "oggi" : i.daysLate === 1 ? "ieri" : `${i.daysLate} giorni fa`}`;
    case "preventivi":
      return i.askOutcome ? "Sequenza finita senza risposta: Persa o Rimanda?" : `Passo ${i.step} di 4`;
    case "caldi":
      return `${s.warmDays} giorni dall'ultimo contatto`;
    case "freddi":
      return `${s.coldDays} giorni dall'ultimo contatto`;
    case "lead_fermi":
      return "Lead fermo senza preventivo";
  }
  return "";
}

export async function getToday(viewer: User, scope: "mine" | "team") {
  await ensureFreshSuggestions(db);
  const today = todayInRome();
  const [inputs, settings] = await Promise.all([loadFollowupInputs(db), loadFollowupSettings(db)]);
  const queue = buildTodayQueue(today, inputs.people, inputs.opportunities, settings);
  const draftIds = new Set(pickDrafts(queue, settings).map((i) => i.id));

  const [peopleRows, oppRows] = await Promise.all([
    db
      .select({ p: people, company: companies, owner: owners })
      .from(people)
      .leftJoin(companies, eq(companies.id, people.companyId))
      .leftJoin(owners, eq(owners.id, people.ownerId)),
    db
      .select({ o: opportunities, company: companies, owner: owners, person: people })
      .from(opportunities)
      .innerJoin(companies, eq(companies.id, opportunities.companyId))
      .leftJoin(people, eq(people.id, opportunities.personId))
      .leftJoin(owners, eq(owners.id, opportunities.ownerId)),
  ]);
  const personById = new Map(peopleRows.map((r) => [r.p.id, r]));
  const oppById = new Map(oppRows.map((r) => [r.o.id, r]));

  const entries: TodayEntry[] = queue.flatMap((i): TodayEntry[] => {
    if (i.kind === "persona") {
      const r = personById.get(i.id);
      if (!r) return [];
      return [
        {
          ...i,
          title: fullName(r.p),
          subtitle: [r.p.position, r.company?.name].filter(Boolean).join(" · "),
          companyId: r.company?.id ?? null,
          companyName: r.company?.name ?? null,
          ownerName: r.owner?.name ?? null,
          ownerId: r.p.ownerId,
          value: null,
          reason: reasonFor(i, settings),
          hasDraft: draftIds.has(i.id),
          href: `/people/${i.id}`,
        },
      ];
    }
    const r = oppById.get(i.id);
    if (!r) return [];
    return [
      {
        ...i,
        title: r.o.name,
        subtitle: [r.company.name, r.person ? fullName(r.person) : null].filter(Boolean).join(" · "),
        companyId: r.company.id,
        companyName: r.company.name,
        ownerName: r.owner?.name ?? null,
        ownerId: r.o.ownerId,
        value: r.o.finalValue ?? r.o.initialValue,
        reason: reasonFor(i, settings),
        hasDraft: draftIds.has(i.id),
        href: `/pipeline/${i.id}`,
      },
    ];
  });

  const visible = scope === "mine" ? entries.filter((e) => e.ownerId === viewer.id) : entries;

  const [myTasks, todaysMeetings, signals, topSuggestions] = await Promise.all([
    db
      .select({ t: tasks, project: projects })
      .from(tasks)
      .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          scope === "mine" ? eq(taskAssignees.userId, viewer.id) : undefined,
          inArray(tasks.status, ["da_fare", "in_corso"]),
          lte(tasks.dueOn, addDays(today, 2)),
          isNull(tasks.parentId),
        ),
      )
      .orderBy(asc(tasks.dueOn)),
    db
      .select({ m: meetings, company: companies })
      .from(meetings)
      .leftJoin(companies, eq(companies.id, meetings.companyId))
      .where(sql`(${meetings.occurredAt} at time zone 'Europe/Rome')::date = ${today}::date`)
      .orderBy(asc(meetings.occurredAt)),
    db
      .select({ f: facts, company: companies })
      .from(facts)
      .leftJoin(companies, eq(companies.id, facts.companyId))
      .where(and(isNull(facts.retractedAt), lte(facts.resurfaceOn, today))),
    db
      .select({ s: suggestions, company: companies })
      .from(suggestions)
      .innerJoin(companies, eq(companies.id, suggestions.companyId))
      .where(and(eq(suggestions.status, "nuovo"), scope === "mine" ? eq(companies.ownerId, viewer.id) : undefined))
      .orderBy(desc(suggestions.score))
      .limit(3),
  ]);

  // Un task può avere più assegnatari: una riga sola
  const taskMap = new Map(myTasks.map((r) => [r.t.id, r]));

  // Briefing dei meeting di oggi: storia, decisioni, task aperti, deal in corso
  const briefings = await Promise.all(
    todaysMeetings.map(async ({ m, company }) => {
      if (!company) return { meeting: m, company, facts: [], openTasks: 0, openDeals: [] as { name: string; value: number | null }[], participants: [] as string[] };
      const [f, openTasks, deals, parts] = await Promise.all([
        db.select().from(facts).where(and(eq(facts.companyId, company.id), isNull(facts.retractedAt))).limit(3),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(tasks)
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(and(eq(projects.companyId, company.id), inArray(tasks.status, ["da_fare", "in_corso"]))),
        db
          .select()
          .from(opportunities)
          .where(and(eq(opportunities.companyId, company.id), inArray(opportunities.stage, ["lead", "in_progress"]))),
        db
          .select({ p: people })
          .from(meetingParticipants)
          .innerJoin(people, eq(people.id, meetingParticipants.personId))
          .where(eq(meetingParticipants.meetingId, m.id)),
      ]);
      return {
        meeting: m,
        company,
        facts: f,
        openTasks: openTasks[0]?.n ?? 0,
        openDeals: deals.map((d) => ({ name: d.name, value: d.finalValue ?? d.initialValue })),
        participants: parts.map((x) => fullName(x.p)),
      };
    }),
  );

  return {
    today,
    settings,
    entries: visible,
    tasks: [...taskMap.values()],
    briefings,
    signals,
    suggestions: topSuggestions,
  };
}

// ---------------------------------------------------------------------------
// Barra laterale e ricerca
// ---------------------------------------------------------------------------

export async function getNavCounts(viewer: User) {
  const today = todayInRome();
  const { entries } = await getTodayEntriesCount(viewer, today);
  const approvals = await countApprovals();
  const [{ n: myTasks }] = await db
    .select({ n: sql<number>`count(distinct ${tasks.id})::int` })
    .from(tasks)
    .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
    .where(and(eq(taskAssignees.userId, viewer.id), inArray(tasks.status, ["da_fare", "in_corso"])));
  const [{ n: newSuggestions }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(suggestions)
    .where(eq(suggestions.status, "nuovo"));
  return { today: entries, approvals, myTasks, suggestions: newSuggestions };
}

async function getTodayEntriesCount(viewer: User, today: string) {
  const [inputs, settings] = await Promise.all([loadFollowupInputs(db), loadFollowupSettings(db)]);
  const queue = buildTodayQueue(today, inputs.people, inputs.opportunities, settings);
  const [peopleOwners, oppOwners] = await Promise.all([
    db.select({ id: people.id, ownerId: people.ownerId }).from(people),
    db.select({ id: opportunities.id, ownerId: opportunities.ownerId }).from(opportunities),
  ]);
  const owner = new Map([...peopleOwners, ...oppOwners].map((r) => [r.id, r.ownerId]));
  return { entries: queue.filter((i) => owner.get(i.id) === viewer.id).length };
}

export async function countApprovals() {
  const [[a], [b], [c], [d]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(people).where(eq(people.status, "da_approvare")),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(people)
      .where(
        and(
          isNotNull(people.proposedMode),
          or(isNull(people.followupMode), ne(people.followupMode, people.proposedMode)),
          eq(people.status, "attivo"),
        ),
      ),
    db.select({ n: sql<number>`count(*)::int` }).from(tasks).where(eq(tasks.status, "proposto")),
    db.select({ n: sql<number>`count(*)::int` }).from(companies).where(eq(companies.dataStatus, "da_verificare")),
  ]);
  return a.n + b.n + c.n + d.n;
}

/** Le liste per i menu di scelta nei form e nei campi modificabili. */
export async function getFormOptions() {
  const [u, c, p, pr] = await Promise.all([
    db.select({ id: users.id, name: users.name, initials: users.initials }).from(users).orderBy(asc(users.name)),
    db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(asc(companies.name)),
    db
      .select({ id: people.id, firstName: people.firstName, lastName: people.lastName, companyId: people.companyId })
      .from(people)
      .where(ne(people.status, "archiviato"))
      .orderBy(asc(people.firstName)),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(ne(projects.status, "chiuso")).orderBy(asc(projects.name)),
  ]);
  return {
    users: u,
    companies: c,
    people: p.map((x) => ({ id: x.id, name: fullName(x), companyId: x.companyId })),
    projects: pr,
  };
}

export async function getSearchIndex() {
  const [c, p, o, pr] = await Promise.all([
    db.select({ id: companies.id, name: companies.name, country: companies.country }).from(companies).orderBy(asc(companies.name)),
    db
      .select({ id: people.id, firstName: people.firstName, lastName: people.lastName, company: companies.name })
      .from(people)
      .leftJoin(companies, eq(companies.id, people.companyId))
      .where(ne(people.status, "archiviato"))
      .orderBy(asc(people.firstName)),
    db
      .select({ id: opportunities.id, name: opportunities.name, company: companies.name })
      .from(opportunities)
      .innerJoin(companies, eq(companies.id, opportunities.companyId)),
    db.select({ id: projects.id, name: projects.name }).from(projects),
  ]);
  return [
    ...c.map((x) => ({ group: "Aziende", id: x.id, label: x.name, hint: x.country ?? "", href: `/companies/${x.id}` })),
    ...p.map((x) => ({ group: "Persone", id: x.id, label: fullName(x), hint: x.company ?? "", href: `/people/${x.id}` })),
    ...o.map((x) => ({ group: "Opportunità", id: x.id, label: x.name, hint: x.company, href: `/pipeline/${x.id}` })),
    ...pr.map((x) => ({ group: "Progetti", id: x.id, label: x.name, hint: "", href: `/progetti/${x.id}` })),
  ];
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

/** Con `ownerId` solo le aziende di quell'owner, senza tutte quelle del team. */
export async function listCompanies(ownerId?: string) {
  return db
    .select({
      c: companies,
      owner: owners,
      people: sql<number>`(select count(*)::int from people where people.company_id = ${companies.id} and people.status <> 'archiviato')`,
      activeProjects: sql<number>`(select count(*)::int from projects where projects.company_id = ${companies.id} and projects.status = 'attivo')`,
      openValue: sql<number | null>`(select sum(coalesce(final_value, initial_value))::float from opportunities where opportunities.company_id = ${companies.id} and stage in ('lead','in_progress'))`,
    })
    .from(companies)
    .leftJoin(owners, eq(owners.id, companies.ownerId))
    .where(ownerId ? eq(companies.ownerId, ownerId) : undefined)
    .orderBy(desc(companies.lastInteractionAt));
}

export async function getCompany(id: string, viewer: User) {
  const [row] = await db
    .select({ c: companies, owner: owners })
    .from(companies)
    .leftJoin(owners, eq(owners.id, companies.ownerId))
    .where(eq(companies.id, id));
  if (!row) return null;

  const [peopleRows, opps, prjs, factRows, timeline] = await Promise.all([
    db.select().from(people).where(and(eq(people.companyId, id), ne(people.status, "archiviato"))).orderBy(asc(people.firstName)),
    db.select().from(opportunities).where(eq(opportunities.companyId, id)).orderBy(desc(opportunities.createdAt)),
    db.select().from(projects).where(eq(projects.companyId, id)),
    db.select().from(facts).where(and(eq(facts.companyId, id), isNull(facts.retractedAt))).orderBy(desc(facts.createdAt)),
    getTimeline(viewer, { companyId: id }),
  ]);
  return { ...row, people: peopleRows, opportunities: opps, projects: prjs, facts: factRows, timeline };
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export async function listPeople(ownerId?: string) {
  return db
    .select({ p: people, company: companies, owner: owners })
    .from(people)
    .leftJoin(companies, eq(companies.id, people.companyId))
    .leftJoin(owners, eq(owners.id, people.ownerId))
    .where(and(eq(people.status, "attivo"), ownerId ? eq(people.ownerId, ownerId) : undefined))
    .orderBy(asc(people.nextFollowupOn), asc(people.firstName));
}

export async function getPerson(id: string, viewer: User) {
  const [row] = await db
    .select({ p: people, company: companies, owner: owners, event: events })
    .from(people)
    .leftJoin(companies, eq(companies.id, people.companyId))
    .leftJoin(owners, eq(owners.id, people.ownerId))
    .leftJoin(events, eq(events.id, people.eventId))
    .where(eq(people.id, id));
  if (!row) return null;
  const [opps, factRows, timeline] = await Promise.all([
    db.select().from(opportunities).where(eq(opportunities.personId, id)),
    db.select().from(facts).where(and(eq(facts.personId, id), isNull(facts.retractedAt))),
    getTimeline(viewer, { personId: id }),
  ]);
  const openQuote = opps.find((o) => o.stage === "in_progress");
  return { ...row, opportunities: opps, facts: factRows, timeline, openQuote };
}

// ---------------------------------------------------------------------------
// Timeline condivisa: email private visibili solo a chi le ha
// ---------------------------------------------------------------------------

export type TimelineItem = Awaited<ReturnType<typeof getTimeline>>[number];

export async function getTimeline(
  viewer: User,
  filter: { companyId?: string; personId?: string; opportunityId?: string; projectId?: string },
) {
  const conditions = [visibleTo(viewer)];
  if (filter.companyId) conditions.push(eq(interactions.companyId, filter.companyId));
  if (filter.opportunityId) conditions.push(eq(interactions.opportunityId, filter.opportunityId));
  if (filter.projectId) conditions.push(eq(interactions.projectId, filter.projectId));
  if (filter.personId) {
    conditions.push(
      inArray(
        interactions.id,
        db.select({ id: interactionPeople.interactionId }).from(interactionPeople).where(eq(interactionPeople.personId, filter.personId)),
      ),
    );
  }

  const rows = await db
    .select({ i: interactions, owner: owners })
    .from(interactions)
    .leftJoin(owners, eq(owners.id, interactions.ownerId))
    .where(and(...conditions))
    .orderBy(desc(interactions.occurredAt))
    .limit(60);

  // Quante email private degli altri esistono: si mostra solo il conteggio, mai il contenuto
  const hiddenConditions = [eq(interactions.visibility, "privata"), ne(interactions.ownerId, viewer.id)];
  if (filter.companyId) hiddenConditions.push(eq(interactions.companyId, filter.companyId));
  if (filter.opportunityId) hiddenConditions.push(eq(interactions.opportunityId, filter.opportunityId));
  if (filter.projectId) hiddenConditions.push(eq(interactions.projectId, filter.projectId));
  if (filter.personId) {
    hiddenConditions.push(
      inArray(
        interactions.id,
        db.select({ id: interactionPeople.interactionId }).from(interactionPeople).where(eq(interactionPeople.personId, filter.personId)),
      ),
    );
  }
  const [{ n: hiddenCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(interactions)
    .where(and(...hiddenConditions));

  return Object.assign(
    rows.map((r) => ({ ...r.i, ownerName: r.owner?.name ?? null, isMine: r.i.ownerId === viewer.id })),
    { hiddenCount },
  );
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function getPipeline(ownerId?: string) {
  const rows = await db
    .select({ o: opportunities, company: companies, person: people, owner: owners })
    .from(opportunities)
    .innerJoin(companies, eq(companies.id, opportunities.companyId))
    .leftJoin(people, eq(people.id, opportunities.personId))
    .leftJoin(owners, eq(owners.id, opportunities.ownerId))
    .where(ownerId ? eq(opportunities.ownerId, ownerId) : undefined)
    .orderBy(desc(opportunities.updatedAt));
  const today = todayInRome();
  return rows.map((r) => ({
    id: r.o.id,
    name: r.o.name,
    stage: r.o.stage,
    company: r.company.name,
    companyId: r.company.id,
    person: r.person ? fullName(r.person) : null,
    owner: r.owner?.initials ?? null,
    value: r.o.finalValue ?? r.o.initialValue,
    step: r.o.followupStep,
    quoteSentOn: r.o.quoteSentOn,
    daysSinceQuote: r.o.quoteSentOn ? Math.max(0, Math.round((Date.parse(today) - Date.parse(r.o.quoteSentOn)) / 86_400_000)) : null,
    nextFollowupOn: r.o.nextFollowupOn,
    lostReason: r.o.lostReason,
  }));
}

export type PipelineCard = Awaited<ReturnType<typeof getPipeline>>[number];

export async function getOpportunity(id: string, viewer: User) {
  const [row] = await db
    .select({ o: opportunities, company: companies, person: people, owner: owners, project: projects })
    .from(opportunities)
    .innerJoin(companies, eq(companies.id, opportunities.companyId))
    .leftJoin(people, eq(people.id, opportunities.personId))
    .leftJoin(owners, eq(owners.id, opportunities.ownerId))
    .leftJoin(projects, eq(projects.opportunityId, opportunities.id))
    .where(eq(opportunities.id, id));
  if (!row) return null;
  const timeline = await getTimeline(viewer, { opportunityId: id });
  return { ...row, timeline };
}

// ---------------------------------------------------------------------------
// Progetti e task
// ---------------------------------------------------------------------------

async function assigneesFor(taskIds: string[]) {
  if (!taskIds.length) return new Map<string, User[]>();
  const rows = await db
    .select({ taskId: taskAssignees.taskId, u: users })
    .from(taskAssignees)
    .innerJoin(users, eq(users.id, taskAssignees.userId))
    .where(inArray(taskAssignees.taskId, taskIds));
  const map = new Map<string, User[]>();
  for (const r of rows) map.set(r.taskId, [...(map.get(r.taskId) ?? []), r.u]);
  return map;
}

/** Con `userId` solo i progetti di cui è owner o nel team. */
export async function listProjects(userId?: string) {
  const rows = await db
    .select({
      p: projects,
      company: companies,
      owner: owners,
      total: sql<number>`(select count(*)::int from tasks where tasks.project_id = ${projects.id} and tasks.parent_id is null and tasks.status <> 'proposto')`,
      done: sql<number>`(select count(*)::int from tasks where tasks.project_id = ${projects.id} and tasks.parent_id is null and tasks.status = 'fatto')`,
      overdue: sql<number>`(select count(*)::int from tasks where tasks.project_id = ${projects.id} and tasks.status in ('da_fare','in_corso') and tasks.due_on < ${todayInRome()})`,
      nextDue: sql<string | null>`(select min(due_on)::text from tasks where tasks.project_id = ${projects.id} and tasks.status in ('da_fare','in_corso'))`,
    })
    .from(projects)
    .leftJoin(companies, eq(companies.id, projects.companyId))
    .leftJoin(owners, eq(owners.id, projects.ownerId))
    .where(
      userId
        ? or(
            eq(projects.ownerId, userId),
            inArray(projects.id, db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, userId))),
          )
        : undefined,
    )
    .orderBy(
      sql`case ${projects.status} when 'attivo' then 0 when 'da_avviare' then 1 when 'in_pausa' then 2 else 3 end`,
      sql`case ${projects.health} when 'rosso' then 0 when 'giallo' then 1 else 2 end`,
      asc(projects.dueOn),
    );
  const members = await db
    .select({ projectId: projectMembers.projectId, u: users })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId));
  return rows.map((r) => ({ ...r, team: members.filter((m) => m.projectId === r.p.id).map((m) => m.u) }));
}

export async function getProject(id: string, viewer: User) {
  const [row] = await db
    .select({ p: projects, company: companies, owner: owners, deal: opportunities })
    .from(projects)
    .leftJoin(companies, eq(companies.id, projects.companyId))
    .leftJoin(owners, eq(owners.id, projects.ownerId))
    .leftJoin(opportunities, eq(opportunities.id, projects.opportunityId))
    .where(eq(projects.id, id));
  if (!row) return null;

  const [taskRows, meetingRows, factRows, timeline, team] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.projectId, id)).orderBy(asc(tasks.dueOn)),
    db.select().from(meetings).where(eq(meetings.projectId, id)).orderBy(desc(meetings.occurredAt)),
    db.select().from(facts).where(and(eq(facts.projectId, id), isNull(facts.retractedAt))),
    getTimeline(viewer, { projectId: id }),
    db.select({ u: users }).from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId)).where(eq(projectMembers.projectId, id)),
  ]);
  const assignees = await assigneesFor(taskRows.map((t) => t.id));
  const withAssignees = taskRows.map((t) => ({ ...t, assignees: assignees.get(t.id) ?? [] }));
  const roots = withAssignees
    .filter((t) => !t.parentId)
    .map((t) => ({ ...t, subtasks: withAssignees.filter((s) => s.parentId === t.id) }));
  return {
    ...row,
    tasks: roots,
    meetings: meetingRows.map((m) => ({ ...m, transcript: m.ownerId === viewer.id ? m.transcript : null })),
    facts: factRows,
    timeline,
    team: team.map((t) => t.u),
  };
}

export type ProjectTask = NonNullable<Awaited<ReturnType<typeof getProject>>>["tasks"][number];

/** Task aperti: quelli assegnati a me, o di tutto il team (anche quelli senza assegnatario). */
export async function getTasks(viewer: User, scope: "mine" | "team") {
  const rows = await db
    .select({ t: tasks, project: projects, company: companies })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(companies, eq(companies.id, sql`coalesce(${tasks.companyId}, ${projects.companyId})`))
    .where(
      and(
        inArray(tasks.status, ["da_fare", "in_corso"]),
        scope === "mine"
          ? inArray(tasks.id, db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.userId, viewer.id)))
          : undefined,
      ),
    )
    .orderBy(asc(tasks.dueOn));
  const today = todayInRome();
  const week = addDays(today, 7);
  const assignees = await assigneesFor(rows.map((r) => r.t.id));
  const withAssignees = rows.map((r) => {
    const list = assignees.get(r.t.id) ?? [];
    return { ...r, assignees: list, assigneeIds: list.map((u) => u.id) };
  });
  type Row = (typeof withAssignees)[number];
  const groups = { in_ritardo: [] as Row[], oggi: [] as Row[], settimana: [] as Row[], dopo: [] as Row[] };
  for (const r of withAssignees) {
    const due = r.t.dueOn;
    if (due && due < today) groups.in_ritardo.push(r);
    else if (due === today) groups.oggi.push(r);
    else if (due && due <= week) groups.settimana.push(r);
    else groups.dopo.push(r);
  }
  return groups;
}

export async function getMeeting(id: string, viewer: User) {
  const [row] = await db
    .select({ m: meetings, company: companies, project: projects, owner: owners })
    .from(meetings)
    .leftJoin(companies, eq(companies.id, meetings.companyId))
    .leftJoin(projects, eq(projects.id, meetings.projectId))
    .leftJoin(owners, eq(owners.id, meetings.ownerId))
    .where(eq(meetings.id, id));
  if (!row) return null;
  if (row.m.visibility === "privata" && row.m.ownerId !== viewer.id) return null;
  const [parts, proposed] = await Promise.all([
    db
      .select({ person: people, user: users })
      .from(meetingParticipants)
      .leftJoin(people, eq(people.id, meetingParticipants.personId))
      .leftJoin(users, eq(users.id, meetingParticipants.userId))
      .where(eq(meetingParticipants.meetingId, id)),
    db.select().from(tasks).where(eq(tasks.meetingId, id)),
  ]);
  return {
    ...row,
    m: { ...row.m, transcript: row.m.ownerId === viewer.id ? row.m.transcript : null },
    participants: parts,
    tasks: proposed,
  };
}

// ---------------------------------------------------------------------------
// Da approvare
// ---------------------------------------------------------------------------

export async function getApprovals() {
  const [newPeople, modeChanges, proposedTasks, toVerify] = await Promise.all([
    db
      .select({ p: people, company: companies })
      .from(people)
      .leftJoin(companies, eq(companies.id, people.companyId))
      .where(eq(people.status, "da_approvare")),
    db
      .select({ p: people, company: companies })
      .from(people)
      .leftJoin(companies, eq(companies.id, people.companyId))
      .where(
        and(
          isNotNull(people.proposedMode),
          or(isNull(people.followupMode), ne(people.followupMode, people.proposedMode)),
          eq(people.status, "attivo"),
        ),
      ),
    db
      .select({ t: tasks, project: projects })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(eq(tasks.status, "proposto"))
      .orderBy(asc(tasks.dueOn)),
    db.select().from(companies).where(eq(companies.dataStatus, "da_verificare")),
  ]);
  const assignees = await assigneesFor(proposedTasks.map((r) => r.t.id));
  return {
    newPeople,
    modeChanges,
    proposedTasks: proposedTasks.map((r) => ({ ...r, assignees: assignees.get(r.t.id) ?? [] })),
    toVerify,
  };
}

// ---------------------------------------------------------------------------
// Opportunità proattive
// ---------------------------------------------------------------------------

/** Con `ownerId` solo i suggerimenti sulle aziende di quell'owner. */
export async function getSuggestions(ownerId?: string) {
  await ensureFreshSuggestions(db);
  const [rows, svc, grantRows, lastRun] = await Promise.all([
    db
      .select({ s: suggestions, company: companies, person: people, service: services, grant: grants, fact: facts, owner: owners })
      .from(suggestions)
      .innerJoin(companies, eq(companies.id, suggestions.companyId))
      .leftJoin(owners, eq(owners.id, companies.ownerId))
      .leftJoin(people, eq(people.id, suggestions.personId))
      .leftJoin(services, eq(services.id, suggestions.serviceId))
      .leftJoin(grants, eq(grants.id, suggestions.grantId))
      .leftJoin(facts, eq(facts.id, suggestions.factId))
      .where(and(ne(suggestions.status, "scartato"), ownerId ? eq(companies.ownerId, ownerId) : undefined))
      .orderBy(desc(suggestions.score)),
    db.select().from(services).orderBy(desc(services.launchedOn), asc(services.name)),
    db.select().from(grants).orderBy(asc(grants.deadlineOn)),
    db
      .select({ at: agentLog.at, detail: agentLog.detail })
      .from(agentLog)
      .where(eq(agentLog.action, "opportunita_regole"))
      .orderBy(desc(agentLog.at))
      .limit(1),
  ]);
  return { suggestions: rows, services: svc, grants: grantRows, lastRun: lastRun[0] ?? null };
}

export async function getSettingsPage() {
  const [followup, rows, excluded] = await Promise.all([
    loadFollowupSettings(db),
    db.select().from(settings),
    db.select().from(excludedAddresses).orderBy(asc(excludedAddresses.address)),
  ]);
  const get = <T,>(key: string, fallback: T) => (rows.find((r) => r.key === key)?.value as T) ?? fallback;
  return {
    followup,
    suggestions: await loadSuggestionSettings(db),
    digest: get("digest", { time: "08:00", days: "lun-ven", timezone: "Europe/Rome" }),
    internalDomains: get<string[]>("internal_domains", ["somaspaceagency.com"]),
    categories: get<string[]>("categories", ["B2B", "Upstream", "Downstream", "Software", "Hardware"]),
    excluded,
  };
}

export async function getAgentLog() {
  return db
    .select({ l: agentLog, user: users })
    .from(agentLog)
    .leftJoin(users, eq(users.id, agentLog.onBehalfOf))
    .orderBy(desc(agentLog.at))
    .limit(50);
}

export async function getMySharedFacts(viewer: User) {
  return db
    .select({ f: facts, company: companies })
    .from(facts)
    .leftJoin(companies, eq(companies.id, facts.companyId))
    .where(eq(facts.contributorId, viewer.id))
    .orderBy(desc(facts.createdAt));
}

export { toRomeDate };

export async function getFollowupSettings() {
  return loadFollowupSettings(db);
}

// ---------------------------------------------------------------------------
// Eventi e conversione (specifica, sezione 6)
// ---------------------------------------------------------------------------

type EventPerson = {
  id: string;
  name: string;
  position: string | null;
  company: { id: string; name: string } | null;
  /** Ha un'opportunità sua o della sua azienda */
  opportunity: boolean;
  /** La sua azienda è cliente, o ha un deal vinto */
  client: boolean;
};

/**
 * Per ogni evento: persone incontrate, arrivate a un'opportunità, diventate clienti.
 * Una persona conta come arrivata a un'opportunità se ne ha una lei o la sua azienda.
 */
async function eventConversion(eventId?: string) {
  const [evs, ppl, opps] = await Promise.all([
    db
      .select()
      .from(events)
      .where(eventId ? eq(events.id, eventId) : undefined)
      .orderBy(sql`${events.date} desc nulls last`, asc(events.name)),
    db
      .select({ p: people, company: companies })
      .from(people)
      .leftJoin(companies, eq(companies.id, people.companyId))
      .where(and(eventId ? eq(people.eventId, eventId) : isNotNull(people.eventId), ne(people.status, "archiviato"))),
    db.select({ personId: opportunities.personId, companyId: opportunities.companyId, stage: opportunities.stage }).from(opportunities),
  ]);

  const oppPeople = new Set(opps.flatMap((o) => (o.personId ? [o.personId] : [])));
  const oppCompanies = new Set(opps.map((o) => o.companyId));
  const wonPeople = new Set(opps.flatMap((o) => (o.stage === "vinta" && o.personId ? [o.personId] : [])));
  const wonCompanies = new Set(opps.flatMap((o) => (o.stage === "vinta" ? [o.companyId] : [])));

  const byEvent = new Map<string, EventPerson[]>();
  for (const { p, company } of ppl) {
    const list = byEvent.get(p.eventId!) ?? [];
    list.push({
      id: p.id,
      name: fullName(p),
      position: p.position,
      company: company ? { id: company.id, name: company.name } : null,
      opportunity: oppPeople.has(p.id) || (!!p.companyId && oppCompanies.has(p.companyId)),
      client: wonPeople.has(p.id) || company?.relationship === "cliente" || (!!p.companyId && wonCompanies.has(p.companyId)),
    });
    byEvent.set(p.eventId!, list);
  }

  return evs.map((e) => {
    const list = (byEvent.get(e.id) ?? []).sort((a, b) => Number(b.client) - Number(a.client) || Number(b.opportunity) - Number(a.opportunity) || a.name.localeCompare(b.name, "it"));
    const met = list.length;
    const opportunity = list.filter((x) => x.opportunity || x.client).length;
    const clients = list.filter((x) => x.client).length;
    return { event: e, people: list, met, opportunity, clients, rate: met ? clients / met : null };
  });
}

/** Per il campo Evento della persona: prima i più recenti. */
export async function listEventOptions() {
  const rows = await db
    .select({ id: events.id, name: events.name, date: events.date })
    .from(events)
    .orderBy(sql`${events.date} desc nulls last`, asc(events.name));
  return rows.map((e) => ({ value: e.id, label: e.date ? `${e.name} · ${e.date.slice(0, 4)}` : e.name }));
}

export async function listEvents() {
  return eventConversion();
}

export async function getEvent(id: string) {
  const [row] = await eventConversion(id);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Calendario: scadenze dei task, consegne dei progetti, meeting
// ---------------------------------------------------------------------------

/**
 * Tutto quello che cade tra `from` e `to` (date ISO, estremi inclusi).
 * Miei: task assegnati a me, progetti di cui sono owner o nel team, meeting miei o a cui ho partecipato.
 * I meeting privati degli altri non compaiono mai.
 */
export async function getCalendar(viewer: User, scope: "mine" | "team", from: string, to: string) {
  const myProjects = db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, viewer.id));
  const [taskRows, projectRows, meetingRows] = await Promise.all([
    db
      .select({ t: tasks, project: projects })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          sql`${tasks.dueOn} between ${from} and ${to}`,
          ne(tasks.status, "proposto"),
          scope === "mine"
            ? inArray(tasks.id, db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.userId, viewer.id)))
            : undefined,
        ),
      )
      .orderBy(asc(tasks.dueOn)),
    db
      .select({ p: projects, company: companies })
      .from(projects)
      .leftJoin(companies, eq(companies.id, projects.companyId))
      .where(
        and(
          sql`${projects.dueOn} between ${from} and ${to}`,
          scope === "mine" ? or(eq(projects.ownerId, viewer.id), inArray(projects.id, myProjects)) : undefined,
        ),
      ),
    db
      .select({ m: meetings, company: companies })
      .from(meetings)
      .leftJoin(companies, eq(companies.id, meetings.companyId))
      .where(
        and(
          sql`(${meetings.occurredAt} at time zone 'Europe/Rome')::date between ${from} and ${to}`,
          or(eq(meetings.visibility, "team"), eq(meetings.ownerId, viewer.id)),
          scope === "mine"
            ? or(
                eq(meetings.ownerId, viewer.id),
                inArray(meetings.id, db.select({ id: meetingParticipants.meetingId }).from(meetingParticipants).where(eq(meetingParticipants.userId, viewer.id))),
              )
            : undefined,
        ),
      )
      .orderBy(asc(meetings.occurredAt)),
  ]);
  const assignees = await assigneesFor(taskRows.map((r) => r.t.id));
  return {
    tasks: taskRows.map((r) => ({ ...r, assignees: assignees.get(r.t.id) ?? [] })),
    projects: projectRows,
    meetings: meetingRows,
  };
}
