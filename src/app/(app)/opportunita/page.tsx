import Link from "next/link";
import { Suspense } from "react";
import { Chip, UserAvatar } from "@/components/crm/chips";
import { EmptyState, PageHeader, PageSkeleton, Section } from "@/components/crm/page-header";
import { parseScope, ScopeToggle } from "@/components/crm/scope-toggle";
import { RunSuggestionsButton, SuggestionActions } from "@/components/crm/suggestion-actions";
import { formatDate, fullName, relativeDay } from "@/lib/format";
import { SUGGESTION_REASON, type Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { getSuggestions } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Opportunità suggerite" };

export default function SuggestionsPage(props: PageProps<"/opportunita">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Suggestions {...props} />
    </Suspense>
  );
}

const REASON_TONE: Record<keyof typeof SUGGESTION_REASON, Tone> = {
  servizio: "cold",
  bando: "warn",
  segnale: "brand",
  dormiente: "neutral",
  ripresa: "hot",
};

const time = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

async function Suggestions({ searchParams }: PageProps<"/opportunita">) {
  const scope = parseScope((await searchParams).vista, "team");
  const { viewer } = await getViewer();
  const { suggestions, services, grants, lastRun } = await getSuggestions(scope === "mine" ? viewer.id : undefined);
  const fresh = suggestions.filter((r) => r.s.status === "nuovo");
  const accepted = suggestions.filter((r) => r.s.status === "accettato");

  return (
    <>
      <PageHeader
        title="Opportunità suggerite"
        description="Chi ricontattare e perché, da quello che il CRM sa già"
        actions={
          <>
            <ScopeToggle path="/opportunita" value={scope} fallback="team" mine="Le mie aziende" team="Tutte" />
            <RunSuggestionsButton />
          </>
        }
      />
      <div className="grid gap-8 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section title="Da valutare" count={fresh.length}>
            {lastRun ? (
              <p className="text-xs text-muted-foreground">
                Ultimo controllo {relativeDay(lastRun.at)} alle {time.format(lastRun.at)}: {lastRun.detail}.
              </p>
            ) : null}
            {fresh.length ? null : (
              <EmptyState>
                {scope === "mine"
                  ? "Nessun suggerimento sulle aziende che segui tu. Prova con Tutte."
                  : "Nessun suggerimento per ora. Le regole ricontrollano ogni giorno; con email e meeting collegati arriveranno anche i segnali dalle conversazioni."}
              </EmptyState>
            )}
            <ul className="divide-y overflow-hidden rounded-[10px] border bg-card empty:hidden">
              {fresh.map(({ s, company, person, service, grant, owner }) => (
                <li key={s.id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex w-12 shrink-0 flex-col items-center" title="Quanto è adatto, da 0 a 100">
                    <span className="text-lg font-semibold tabular-nums">{s.score}</span>
                    <div className="h-1 w-10 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-foreground/70" style={{ width: `${s.score}%` }} />
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/companies/${company.id}`} className="text-sm font-medium hover:underline">
                        {company.name}
                      </Link>
                      {person ? (
                        <Link href={`/people/${person.id}`} className="text-xs text-muted-foreground hover:underline">
                          {fullName(person)}
                        </Link>
                      ) : null}
                      <Chip tone={REASON_TONE[s.reason]}>
                        {SUGGESTION_REASON[s.reason]}
                        {service ? `: ${service.name}` : grant ? `: ${grant.name}` : ""}
                      </Chip>
                      {owner && scope === "team" ? <UserAvatar initials={owner.initials} name={`Segue ${owner.name}`} /> : null}
                    </div>
                    <p className="text-[13px] text-foreground/80">{s.rationale}</p>
                  </div>
                  <SuggestionActions id={s.id} />
                </li>
              ))}
            </ul>
          </Section>

          {accepted.length ? (
            <Section title="Accettate" count={accepted.length}>
              <p className="text-xs text-muted-foreground">
                Con Gmail collegato (fase 4) l&apos;agente preparerà anche la bozza nella casella di chi segue il cliente.
              </p>
              <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
                {accepted.map(({ s, company, service }) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 text-[13px]">
                    <span className="font-medium">{company.name}</span>
                    <span className="text-muted-foreground">
                      {SUGGESTION_REASON[s.reason]}
                      {service ? `: ${service.name}` : ""}
                    </span>
                    {s.opportunityId ? (
                      <Link href={`/pipeline/${s.opportunityId}`} className="ml-auto text-xs hover:underline">
                        Apri il deal
                      </Link>
                    ) : (
                      <span className="ml-auto text-xs text-muted-foreground">senza deal</span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          <Section title="Come vengono scelte">
            <dl className="flex flex-col gap-3 rounded-[10px] border bg-card p-3.5 text-[13px]">
              {[
                ["Servizio", "Un cliente ha già fatto un servizio con noi: si propone quello che di solito viene dopo (dopo il brand, il sito; dopo il sito, social e marketing). Contano anche gli interessi delle persone."],
                ["Cliente dormiente", "Un cliente senza contatti né progetti in corso da più della soglia in Impostazioni."],
                ["Deal da riprendere", "Un deal perso torna dopo il tempo giusto per il motivo: 4 mesi per tempistica o nessuna risposta, 6 per prezzo, un anno se hanno scelto un concorrente."],
                ["Segnale", "Un fatto con una data detto in un'email o in un meeting: torna due settimane prima."],
              ].map(([t, d]) => (
                <div key={t} className="flex flex-col gap-0.5">
                  <dt className="font-medium">{t}</dt>
                  <dd className="text-muted-foreground">{d}</dd>
                </div>
              ))}
              <p className="border-t pt-3 text-xs text-muted-foreground">
                Chi ha una trattativa aperta non riceve proposte. Una proposta scartata non torna per 6 mesi.
              </p>
            </dl>
          </Section>
          <Section title="Bandi" count={grants.length}>
            {grants.length ? null : <EmptyState>Nessun bando inserito.</EmptyState>}
            <ul className="flex flex-col gap-2 empty:hidden">
              {grants.map((g) => (
                <li key={g.id} className="flex flex-col gap-1 rounded-[10px] border bg-card p-3">
                  <span className="text-sm font-medium">{g.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.body} · {g.amount}
                  </span>
                  <span className={cn("text-xs", "font-medium text-warn")}>
                    Scade {relativeDay(g.deadlineOn)} ({formatDate(g.deadlineOn)})
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Servizi Somaspace" count={services.length}>
            <ul className="flex flex-col divide-y overflow-hidden rounded-[10px] border bg-card">
              {services.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  {s.name}
                  {s.status === "nuovo" ? (
                    <Chip tone="ok" className="ml-auto">
                      Nuovo
                    </Chip>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        </aside>
      </div>
    </>
  );
}
