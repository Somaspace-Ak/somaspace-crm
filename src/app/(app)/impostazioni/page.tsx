import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/crm/chips";
import { EmptyState, PageHeader, PageSkeleton, Section } from "@/components/crm/page-header";
import { formatDate, formatTime } from "@/lib/format";
import { FACT_KIND } from "@/lib/labels";
import { retractFact } from "@/server/actions";
import { ExcludedAddresses, FollowupSettingsForm, GeneralSettingsForm, SuggestionSettingsForm } from "@/components/crm/settings-forms";
import { GoogleConnection } from "@/components/crm/google-connection";
import { googleConfigured } from "@/server/google/client";
import { getAgentLog, getGoogleStatus, getMySharedFacts, getSettingsPage } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Impostazioni" };

export default function SettingsPage(props: PageProps<"/impostazioni">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings {...props} />
    </Suspense>
  );
}

async function Settings({ searchParams }: PageProps<"/impostazioni">) {
  const { google: flash } = await searchParams;
  const { viewer, team } = await getViewer();
  const [log, shared, cfg, google] = await Promise.all([getAgentLog(), getMySharedFacts(viewer), getSettingsPage(), getGoogleStatus(viewer)]);

  return (
    <>
      <PageHeader title="Impostazioni" description="Parametri dell'agente, cosa ha condiviso la tua casella, cosa ha fatto l'agente" />
      <div className="grid gap-8 p-4 md:p-6 xl:grid-cols-2">
        <div className="flex flex-col gap-8">
          <div id="google" className="scroll-mt-20">
            <Section title="Gmail e Google Calendar">
              <GoogleConnection
                configured={googleConfigured}
                flash={typeof flash === "string" ? flash : null}
                mine={google.mine}
                team={team.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, initials: u.initials, connected: google.connectedUserIds.includes(u.id) }))}
              />
            </Section>
          </div>

          <Section title="Follow-up">
            <FollowupSettingsForm value={cfg.followup} />
          </Section>

          <Section title="Opportunità suggerite">
            <SuggestionSettingsForm dormantDays={cfg.suggestions.dormantDays} />
          </Section>

          <Section title="Generali">
            <GeneralSettingsForm digest={cfg.digest} internalDomains={cfg.internalDomains} categories={cfg.categories} />
          </Section>

          <Section title="Domini e mittenti esclusi" count={cfg.excluded.length}>
            <p className="text-xs text-muted-foreground">Newsletter, notifiche e fornitori di servizi: l&apos;agente non li propone mai come contatti.</p>
            <ExcludedAddresses items={cfg.excluded.map((x) => ({ address: x.address, reason: x.reason }))} />
          </Section>
        </div>

        <div className="flex flex-col gap-8">
          <Section title="Cosa ha condiviso la mia casella" count={shared.filter((f) => !f.f.retractedAt).length}>
            <p className="text-xs text-muted-foreground">
              Fatti estratti dalle tue email e dai tuoi meeting, visibili al team senza dire da dove arrivano. Puoi ritirarli quando vuoi.
            </p>
            {shared.length ? (
              <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
                {shared.map(({ f, company }) => (
                  <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className={f.retractedAt ? "text-sm text-muted-foreground line-through" : "text-sm"}>{f.text}</span>
                      <span className="text-xs text-muted-foreground">
                        {company?.name} · {FACT_KIND[f.kind]}
                      </span>
                    </div>
                    {f.retractedAt ? (
                      <Chip>Ritirato</Chip>
                    ) : (
                      <form action={retractFact.bind(null, f.id)}>
                        <Button size="sm" variant="ghost" type="submit">
                          Ritira
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>La tua casella non ha ancora condiviso fatti.</EmptyState>
            )}
          </Section>

        <Section title="Log dell'agente">
          <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
            {log.map(({ l, user }) => (
              <li key={l.id} className="flex flex-col gap-0.5 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{l.action}</span>
                  <Chip tone={l.outcome === "ok" ? "ok" : "warn"}>{l.outcome}</Chip>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {formatDate(l.at)} {formatTime(l.at)}
                  </span>
                </div>
                {l.detail ? <span className="text-xs text-muted-foreground">{l.detail}</span> : null}
                {user ? <span className="text-xs text-muted-foreground">Per conto di {user.name}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
        </div>
      </div>
    </>
  );
}
