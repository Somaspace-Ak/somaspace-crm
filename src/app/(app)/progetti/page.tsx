import { Suspense } from "react";
import { CreateButton } from "@/components/crm/create-dialogs";
import { PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { ProjectsView } from "@/components/crm/projects-view";
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
  const sp = await searchParams;
  const scope = parseScope(sp.vista, "team");
  const { viewer } = await getViewer();
  const rows = await listProjects(scope === "mine" ? viewer.id : undefined);
  const person = (u: { id: string; name: string; initials: string }) => ({ id: u.id, name: u.name, initials: u.initials });
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
      <ProjectsView
        layout={sp.formato === "lista" ? "lista" : "schede"}
        emptyText={scope === "mine" ? "Non sei owner né nel team di nessun progetto." : "Nessun progetto. Si aprono da soli quando un deal è vinto."}
        rows={rows.map(({ p, company, owner, total, done, overdue, nextDue, team }) => ({
          id: p.id,
          name: p.name,
          company: company ? { id: company.id, name: company.name } : null,
          status: p.status,
          health: p.health,
          healthNote: p.healthNote,
          dueOn: p.dueOn,
          total,
          done,
          overdue,
          nextDue,
          owner: owner ? person(owner) : null,
          team: team.map(person),
        }))}
      />
    </>
  );
}
