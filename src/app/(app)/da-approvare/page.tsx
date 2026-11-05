import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { AgentMark, ModeChip } from "@/components/crm/chips";
import { EmptyState, PageHeader, PageSkeleton, Section } from "@/components/crm/page-header";
import { TaskList } from "@/components/crm/task-list";
import { fullName } from "@/lib/format";
import { MODE } from "@/lib/labels";
import {
  acceptAllModeProposals,
  acceptModeProposal,
  approvePerson,
  discardPerson,
  dismissModeProposal,
  verifyCompany,
} from "@/server/actions";
import { getApprovals } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Da approvare" };

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Approvals />
    </Suspense>
  );
}

function Decide({ accept, discard, acceptLabel = "Accetta" }: { accept: () => Promise<void>; discard: () => Promise<void>; acceptLabel?: string }) {
  return (
    <div className="flex shrink-0 gap-1">
      <form action={accept}>
        <Button size="sm" type="submit">
          {acceptLabel}
        </Button>
      </form>
      <form action={discard}>
        <Button size="sm" variant="ghost" type="submit">
          Scarta
        </Button>
      </form>
    </div>
  );
}

async function Approvals() {
  await getViewer();
  const a = await getApprovals();
  const total = a.newPeople.length + a.modeChanges.length + a.proposedTasks.length + a.toVerify.length;

  return (
    <>
      <PageHeader title="Da approvare" description="Quello che l'agente propone. Niente entra nel CRM senza il vostro sì." />
      <div className="flex max-w-4xl flex-col gap-8 p-4 md:p-6">
        {total === 0 ? <EmptyState>Niente da approvare.</EmptyState> : null}

        {a.newPeople.length ? (
          <Section title="Nuovi contatti" count={a.newPeople.length}>
            <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
              {a.newPeople.map(({ p, company }) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">{fullName(p)}</span>
                    <span className="text-xs text-muted-foreground">
                      {[p.position, company?.name, p.email].filter(Boolean).join(" · ")}
                    </span>
                    <AgentMark label="Due email scambiate, dominio di un'azienda già nel CRM" />
                  </div>
                  <Decide accept={approvePerson.bind(null, p.id)} discard={discardPerson.bind(null, p.id)} acceptLabel="Aggiungi" />
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Scartare un indirizzo lo esclude dai suggerimenti futuri.</p>
          </Section>
        ) : null}

        {a.modeChanges.length ? (
          <Section
            title="Caldo o freddo"
            count={a.modeChanges.length}
            action={
              a.modeChanges.length > 1 ? (
                <form action={acceptAllModeProposals}>
                  <Button size="sm" variant="outline" type="submit">
                    Accetta tutte ({a.modeChanges.length})
                  </Button>
                </form>
              ) : null
            }
          >
            <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
              {a.modeChanges.map(({ p, company }) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link href={`/people/${p.id}`} className="text-sm font-medium hover:underline">
                      {fullName(p)} <span className="font-normal text-muted-foreground">· {company?.name}</span>
                    </Link>
                    <div className="flex items-center gap-2 text-xs">
                      <ModeChip mode={p.followupMode} />
                      <span className="text-muted-foreground">→</span>
                      <ModeChip mode={p.proposedMode} />
                    </div>
                    <p className="text-xs text-muted-foreground">{p.proposedModeReason}</p>
                  </div>
                  <Decide
                    accept={acceptModeProposal.bind(null, p.id)}
                    discard={dismissModeProposal.bind(null, p.id)}
                    acceptLabel={`Passa a ${p.proposedMode ? MODE[p.proposedMode].label : ""}`}
                  />
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {a.proposedTasks.length ? (
          <Section title="Task proposti" count={a.proposedTasks.length}>
            <TaskList tasks={a.proposedTasks.map(({ t, assignees }) => ({ ...t, assignees, subtasks: [] }))} />
          </Section>
        ) : null}

        {a.toVerify.length ? (
          <Section title="Dati aziendali da verificare" count={a.toVerify.length}>
            <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
              {a.toVerify.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link href={`/companies/${c.id}`} className="text-sm font-medium hover:underline">
                      {c.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">{c.description}</span>
                    {c.sources ? <span className="text-xs text-muted-foreground">Fonti: {c.sources}</span> : null}
                  </div>
                  <form action={verifyCompany.bind(null, c.id)}>
                    <Button size="sm" type="submit">
                      Confermo i dati
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </>
  );
}
