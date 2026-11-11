import Link from "next/link";
import { FileText, Lock, Sparkles, Video } from "lucide-react";
import { formatDate, formatTime } from "@/lib/format";
import type { MeetingRow } from "@/server/queries";
import { UserAvatar } from "./chips";
import { EmptyState } from "./page-header";

/**
 * I meeting fatti, con il recap di Gemini quando c'è: data, cliente o progetto, che cosa si è detto.
 * `hide` toglie i collegamenti già ovvi nella pagina (il cliente nella scheda del cliente).
 */
export function MeetingList({
  rows,
  hide = [],
  empty = "Nessun meeting fatto. Arrivano dal Google Calendar di chi li ha in agenda, con il recap delle note di Gemini.",
}: {
  rows: MeetingRow[];
  hide?: ("company" | "project")[];
  empty?: string;
}) {
  if (!rows.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
      {rows.map(({ m, company, project, owner }) => {
        const recording = m.docs.find((d) => d.kind === "registrazione");
        return (
          <li key={m.id} className="relative flex flex-col gap-1 px-3.5 py-3 hover:bg-muted/40">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/meeting/${m.id}`} className="text-sm font-medium after:absolute after:inset-0">
                {m.title}
              </Link>
              {m.visibility === "privata" ? <Lock className="size-3 text-muted-foreground" aria-label="Visibile solo a chi c'era" /> : null}
              <span className="ml-auto flex items-center gap-1.5">
                {m.summary ? <Badge icon={Sparkles}>Recap</Badge> : null}
                {m.hasTranscript ? <Badge icon={FileText}>Trascrizione</Badge> : null}
                {recording ? <Badge icon={Video}>Registrazione</Badge> : null}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {formatDate(m.occurredAt)} · {formatTime(m.occurredAt)}
              </span>
              {company && !hide.includes("company") ? (
                <Link href={`/companies/${company.id}`} className="relative z-10 hover:text-foreground hover:underline">
                  · {company.name}
                </Link>
              ) : null}
              {project && !hide.includes("project") ? (
                <Link href={`/progetti/${project.id}`} className="relative z-10 hover:text-foreground hover:underline">
                  · {project.name}
                </Link>
              ) : null}
              {owner ? <UserAvatar initials={owner.initials} name={`Registrato da ${owner.name}`} className="ml-1" /> : null}
            </div>
            {m.summary ? (
              <p className="mt-0.5 line-clamp-3 text-[13px] whitespace-pre-line text-foreground/80">{m.summary}</p>
            ) : m.docs.some((d) => d.kind === "note" || d.kind === "trascrizione") && !m.hasNotes && !m.hasTranscript ? (
              <p className="text-xs text-muted-foreground/80">Note e trascrizione in arrivo da Drive al prossimo giro.</p>
            ) : null}
            {m.nextSteps.length ? <p className="text-xs text-muted-foreground">{m.nextSteps.length} prossimi passi</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function Badge({ icon: Icon, children }: { icon: typeof Video; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {children}
    </span>
  );
}
