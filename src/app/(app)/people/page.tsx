import { Suspense } from "react";
import { CreateButton } from "@/components/crm/create-dialogs";
import { PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { PeopleTable } from "@/components/crm/people-table";
import { fullName } from "@/lib/format";
import { todayInRome } from "@/lib/followup/dates";
import { parseScope, ScopeToggle } from "@/components/crm/scope-toggle";
import { listPeople } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Persone" };

export default function PeoplePage(props: PageProps<"/people">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <People {...props} />
    </Suspense>
  );
}

async function People({ searchParams }: PageProps<"/people">) {
  const scope = parseScope((await searchParams).vista, "team");
  const { viewer } = await getViewer();
  const rows = await listPeople(scope === "mine" ? viewer.id : undefined);
  return (
    <>
      <PageHeader
        title="Persone"
        description={scope === "mine" ? "I contatti che segui tu, ordinati per prossimo follow-up" : "Contatti attivi, ordinati per prossimo follow-up"}
        actions={
          <>
            <ScopeToggle path="/people" value={scope} fallback="team" mine="Le mie" team="Tutte" />
            <CreateButton kind="persona" variant="default" />
          </>
        }
      />
      <div>
        <PeopleTable
          showOwnerFilter={scope === "team"}
          today={todayInRome()}
          rows={rows.map(({ p, company, owner }) => ({
            id: p.id,
            name: fullName(p),
            company: company ? { id: company.id, name: company.name } : null,
            position: p.position,
            mode: p.followupMode,
            nextFollowupOn: p.nextFollowupOn,
            lastInteractionAt: p.lastInteractionAt?.toISOString() ?? null,
            strength: p.connectionStrength,
            owner: owner ? { id: owner.id, initials: owner.initials, name: owner.name } : null,
            country: company?.country ?? null,
          }))}
        />
      </div>
    </>
  );
}
