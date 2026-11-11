import Link from "next/link";
import { Suspense } from "react";
import { MeetingList } from "@/components/crm/meeting-list";
import { PageHeader, PageSkeleton } from "@/components/crm/page-header";
import { parseScope, ScopeToggle } from "@/components/crm/scope-toggle";
import { cn } from "@/lib/utils";
import { getGoogleStatus, listMeetings } from "@/server/queries";
import { getViewer } from "@/server/session";

export const metadata = { title: "Meeting" };

export default function MeetingsPage(props: PageProps<"/meeting">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Meetings {...props} />
    </Suspense>
  );
}

async function Meetings({ searchParams }: PageProps<"/meeting">) {
  const sp = await searchParams;
  const scope = parseScope(sp.vista, "team");
  const withRecap = sp.recap === "1";
  const { viewer } = await getViewer();
  const [rows, google] = await Promise.all([listMeetings(viewer, { scope, withRecap }), getGoogleStatus(viewer)]);
  const base = scope === "mine" ? "/meeting?vista=miei" : "/meeting";
  const withParam = (on: boolean) => (on ? `${base}${base.includes("?") ? "&" : "?"}recap=1` : base);
  const needsDrive = google.mine && !google.mine.meetDocs;

  return (
    <>
      <PageHeader
        title="Meeting"
        description="I meeting fatti, legati a cliente e progetto, con il recap delle note di Gemini"
        actions={
          <>
            <div className="flex rounded-lg bg-secondary p-0.5 text-[12px]" role="group" aria-label="Quali meeting">
              {[
                { on: false, label: "Tutti" },
                { on: true, label: "Con recap" },
              ].map((o) => (
                <Link
                  key={o.label}
                  href={withParam(o.on)}
                  className={cn("rounded-md px-2.5 py-1 font-medium text-muted-foreground", withRecap === o.on && "bg-background text-foreground shadow-xs")}
                >
                  {o.label}
                </Link>
              ))}
            </div>
            <ScopeToggle path={withRecap ? "/meeting?recap=1" : "/meeting"} value={scope} fallback="team" mine="Miei" team="Di tutti" />
          </>
        }
      />
      <div className="flex max-w-4xl flex-col gap-4 p-4 md:p-6">
        {!google.mine ? (
          <p className="rounded-[10px] border border-dashed p-3 text-[13px] text-muted-foreground">
            Collega Google da <Link href="/impostazioni" className="underline">Impostazioni</Link>: i meeting del tuo calendario arrivano qui con le note di Gemini.
          </p>
        ) : needsDrive ? (
          <p className="rounded-[10px] border border-brand/30 bg-brand-bg p-3 text-[13px]">
            Per leggere note di Gemini e trascrizioni serve un permesso in più: in <Link href="/impostazioni" className="font-medium underline">Impostazioni</Link>{" "}
            premi <span className="font-medium">Ricollega Google</span>. Il CRM vede solo i file creati da Meet, non il resto di Drive.
          </p>
        ) : null}
        <MeetingList rows={rows} />
      </div>
    </>
  );
}
