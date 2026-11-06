import { FileText, Sparkles, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime, relativeDay } from "@/lib/format";
import { UserAvatar } from "./chips";

type Attachment = { title: string; url: string; mimeType: string | null };
type EventRow = {
  e: { id: string; title: string; startsAt: Date; allDay: boolean; meetLink: string | null; htmlLink: string | null; attendees: string[]; attachments: Attachment[] };
  owner: { id: string; name: string; initials: string };
  upcoming: boolean;
};

/** Che cosa è un allegato di Meet, dal nome e dal tipo del file. */
function kindOf(a: Attachment) {
  const t = a.title.toLowerCase();
  if (a.mimeType?.startsWith("video/") || /registrazione|recording/.test(t)) return { label: "Registrazione", icon: Video };
  if (/trascrizione|transcript/.test(t)) return { label: "Trascrizione", icon: FileText };
  if (/gemini|note|notes/.test(t)) return { label: "Note di Gemini", icon: Sparkles };
  return { label: a.title, icon: FileText };
}

/** Le riunioni del Google Calendar legate al progetto: quelle in programma e quelle fatte, con registrazioni e trascrizioni. */
export function ProjectEvents({ events }: { events: EventRow[] }) {
  if (!events.length) return null;
  const upcoming = events.filter((r) => r.upcoming).reverse();
  const past = events.filter((r) => !r.upcoming);
  return (
    <>
      {upcoming.length ? <EventList title="In programma" rows={upcoming} upcoming /> : null}
      {past.length ? <EventList title="Fatti" rows={past} /> : null}
    </>
  );
}

function EventList({ title, rows, upcoming }: { title: string; rows: EventRow[]; upcoming?: boolean }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold">
        {title} <span className="font-normal text-muted-foreground tabular-nums">{rows.length}</span>
      </h2>
      <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
        {rows.map(({ e, owner }) => (
          <li key={e.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{e.title}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="first-letter:uppercase">{relativeDay(e.startsAt)}</span>
                {e.allDay ? null : <span className="tabular-nums">· {formatTime(e.startsAt)}</span>}
                {e.attendees.length ? <span>· {e.attendees.length} partecipanti</span> : null}
                <UserAvatar initials={owner.initials} name={`Nel calendario di ${owner.name}`} />
              </span>
              {e.attachments.length ? (
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {e.attachments.map((a) => {
                    const k = kindOf(a);
                    return (
                      <a
                        key={a.url}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs hover:bg-accent"
                      >
                        <k.icon className="size-3" aria-hidden />
                        {k.label}
                      </a>
                    );
                  })}
                </span>
              ) : !upcoming ? (
                <span className="text-xs text-muted-foreground/70">Nessuna registrazione o trascrizione allegata</span>
              ) : null}
            </div>
            {upcoming && e.meetLink ? (
              <Button asChild size="sm" variant="outline">
                <a href={e.meetLink} target="_blank" rel="noreferrer">
                  <Video aria-hidden />
                  Entra su Meet
                </a>
              </Button>
            ) : e.htmlLink ? (
              <a href={e.htmlLink} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground">
                Apri in Calendar
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
