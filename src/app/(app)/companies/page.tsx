import { Suspense } from "react";
import { CreateButton } from "@/components/crm/create-dialogs";
import { CompaniesTable } from "@/components/crm/companies-table";
import { PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { parseScope, ScopeToggle } from "@/components/crm/scope-toggle";
import { listCompanies } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Aziende" };

export default function CompaniesPage(props: PageProps<"/companies">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Companies {...props} />
    </Suspense>
  );
}

async function Companies({ searchParams }: PageProps<"/companies">) {
  const scope = parseScope((await searchParams).vista, "team");
  const { viewer } = await getViewer();
  const rows = await listCompanies(scope === "mine" ? viewer.id : undefined);
  return (
    <>
      <PageHeader
        title="Aziende"
        description={scope === "mine" ? "Le aziende che segui tu, ordinate per ultimo contatto" : "Tutte le aziende, ordinate per ultimo contatto"}
        actions={
          <>
            <ScopeToggle path="/companies" value={scope} fallback="team" mine="Le mie" team="Tutte" />
            <CreateButton kind="azienda" variant="default" />
          </>
        }
      />
      <div>
        <CompaniesTable
          showOwnerFilter={scope === "team"}
          rows={rows.map(({ c, owner, people, activeProjects, openValue }) => ({
            id: c.id,
            name: c.name,
            domain: c.domains[0] ?? null,
            categories: c.categories,
            country: c.country,
            relationship: c.relationship,
            strength: c.connectionStrength,
            lastInteractionAt: c.lastInteractionAt?.toISOString() ?? null,
            owner: owner ? { id: owner.id, initials: owner.initials, name: owner.name } : null,
            people,
            activeProjects,
            openValue,
            toVerify: c.dataStatus === "da_verificare",
          }))}
        />
      </div>
    </>
  );
}
