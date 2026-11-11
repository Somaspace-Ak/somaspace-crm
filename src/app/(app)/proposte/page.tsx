import { Suspense } from "react";
import { CreateButton } from "@/components/crm/create-dialogs";
import { EmptyState, PageHeader, PageSkeleton, Section } from "@/components/crm/page-header";
import { ProposalList } from "@/components/crm/proposal-list";
import { parseScope, ScopeToggle } from "@/components/crm/scope-toggle";
import { getProposals } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Proposte" };

export default function ProposalsPage(props: PageProps<"/proposte">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Proposals {...props} />
    </Suspense>
  );
}

async function Proposals({ searchParams }: PageProps<"/proposte">) {
  const scope = parseScope((await searchParams).vista, "team");
  const { viewer } = await getViewer();
  const rows = await getProposals(scope === "mine" ? viewer.id : undefined);
  const open = rows.filter((r) => r.r.status === "aperta");
  const decided = rows.filter((r) => r.r.status !== "aperta");

  return (
    <>
      <PageHeader
        title="Proposte"
        description="Chi risentire e perché, proposto da uno di noi: le guardiamo insieme e decidiamo"
        actions={
          <>
            <ScopeToggle path="/proposte" value={scope} fallback="team" mine="Mie" team="Di tutti" />
            <CreateButton kind="proposta" label="Proponi un ricontatto" />
          </>
        }
      />
      <div className="flex max-w-4xl flex-col gap-8 p-4 md:p-6">
        <Section title="Da discutere" count={open.length}>
          {open.length ? (
            <ProposalList rows={open} viewerId={viewer.id} />
          ) : (
            <EmptyState>
              {scope === "mine"
                ? "Non hai proposte aperte. Dalla scheda di una persona o di un'azienda: Proponi ricontatto."
                : "Nessuna proposta da discutere. Chiunque può proporre di risentire un contatto, da qui o dalla sua scheda."}
            </EmptyState>
          )}
        </Section>
        {decided.length ? (
          <Section title="Decise" count={decided.length}>
            <ProposalList rows={decided} viewerId={viewer.id} />
          </Section>
        ) : null}
      </div>
    </>
  );
}
