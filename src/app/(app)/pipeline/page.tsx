import { Suspense } from "react";
import { CreateButton } from "@/components/crm/create-dialogs";
import { PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { PipelineBoard } from "@/components/crm/pipeline-board";
import { formatEuro } from "@/lib/format";
import { todayInRome } from "@/lib/followup/dates";
import { parseScope, ScopeToggle } from "@/components/crm/scope-toggle";
import { getFollowupSettings, getPipeline } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Pipeline" };

export default function PipelinePage(props: PageProps<"/pipeline">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Pipeline {...props} />
    </Suspense>
  );
}

async function Pipeline({ searchParams }: PageProps<"/pipeline">) {
  const scope = parseScope((await searchParams).vista, "team");
  const { viewer } = await getViewer();
  const [cards, settings] = await Promise.all([getPipeline(scope === "mine" ? viewer.id : undefined), getFollowupSettings()]);
  const open = cards.filter((c) => c.stage === "lead" || c.stage === "in_progress");
  const openValue = open.reduce((s, c) => s + (c.value ?? 0), 0);
  return (
    <>
      <PageHeader
        title="Pipeline"
        description={`${open.length} deal aperti · ${formatEuro(openValue)} · trascina una card in Vinta o Persa per chiuderla`}
        actions={
          <>
            <ScopeToggle path="/pipeline" value={scope} fallback="team" mine="I miei deal" team="Tutti" />
            <CreateButton kind="opportunita" variant="default" />
          </>
        }
      />
      <div className="min-h-[calc(100vh-56px)] overflow-x-auto bg-muted px-4 pt-5 pb-8 md:px-6">
        {/* key: dopo ogni salvataggio la board riparte dai dati del server */}
        <PipelineBoard key={cards.map((c) => `${c.id}:${c.stage}`).join("|")} cards={cards} today={todayInRome()} maxReminders={settings.quoteMaxReminders} />
      </div>
    </>
  );
}
