import Link from "next/link";
import { Suspense } from "react";
import { CreateButton } from "@/components/crm/create-dialogs";
import { AvatarStack, CompanyLogo, HealthChip } from "@/components/crm/chips";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { relativeDay } from "@/lib/format";
import { PROJECT_STATUS } from "@/lib/labels";
import { parseScope, ScopeToggle } from "@/components/crm/scope-toggle";
import { listProjects } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Progetti" };

export default function ProjectsPage(props: PageProps<"/progetti">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Projects {...props} />
    </Suspense>
  );
}

async function Projects({ searchParams }: PageProps<"/progetti">) {
  const scope = parseScope((await searchParams).vista, "team");
  const { viewer } = await getViewer();
  const rows = await listProjects(scope === "mine" ? viewer.id : undefined);
  return (
    <>
      <PageHeader
        title="Progetti"
        description={scope === "mine" ? "Quelli di cui sei owner o nel team, prima gli attivi e a rischio" : "Prima quelli attivi e a rischio"}
        actions={
          <>
            <ScopeToggle path="/progetti" value={scope} fallback="team" mine="I miei" team="Tutti" />
            <CreateButton kind="progetto" variant="default" />
          </>
        }
      />
      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 md:p-6 2xl:grid-cols-3">
        {rows.length ? null : (
          <EmptyState>{scope === "mine" ? "Non sei owner né nel team di nessun progetto." : "Nessun progetto. Si aprono da soli quando un deal è vinto."}</EmptyState>
        )}
        {rows.map(({ p, company, total, done, overdue, nextDue, team }) => {
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <Link key={p.id} href={`/progetti/${p.id}`} className="flex min-w-0 flex-col gap-3 rounded-[10px] border bg-card p-4 hover:bg-muted/30">
              <div className="flex items-start gap-3">
                <CompanyLogo name={company?.name ?? p.name} className="size-8 text-sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{p.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {company?.name} · {PROJECT_STATUS[p.status]}
                  </span>
                </div>
                <HealthChip value={p.health} />
              </div>
              {p.healthNote ? <p className="text-xs text-muted-foreground">{p.healthNote}</p> : null}
              <div className="flex flex-col gap-1.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground/70" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {done} di {total} task fatti{overdue ? ` · ${overdue} in ritardo` : ""}
                  </span>
                  <span>{nextDue ? `prossima scadenza ${relativeDay(nextDue)}` : ""}</span>
                </div>
              </div>
              <AvatarStack users={team} />
            </Link>
          );
        })}
      </div>
    </>
  );
}
