import { ArrowDownLeft, ArrowUpRight, Euro, FileText, Lock, Mic, Phone, Users } from "lucide-react";
import type { TimelineItem } from "@/server/queries";
import { formatDate, formatTime } from "@/lib/format";
import { INTERACTION } from "@/lib/labels";
import { PrivateMark } from "./chips";
import { EmptyState } from "./page-header";

const ICON = {
  email_inviata: ArrowUpRight,
  email_ricevuta: ArrowDownLeft,
  meeting: Users,
  chiamata: Phone,
  nota_vocale: Mic,
  nota: FileText,
  modifica_valore: Euro,
} as const;

export function Timeline({ items }: { items: TimelineItem[] & { hiddenCount?: number } }) {
  const hidden = items.hiddenCount ?? 0;
  if (!items.length && !hidden) return <EmptyState>Nessuna interazione registrata.</EmptyState>;
  return (
    <div className="flex flex-col">
      <ol className="flex flex-col">
        {items.map((i, idx) => {
          const Icon = ICON[i.type];
          return (
            <li key={i.id} className="relative flex gap-3 pb-5">
              {idx < items.length - 1 ? <span className="absolute top-7 left-[13px] h-full w-px bg-border" aria-hidden /> : null}
              <span className="z-0 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
                <Icon className="size-3.5 text-muted-foreground" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium">{i.title}</span>
                  {i.visibility === "privata" ? <PrivateMark /> : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {INTERACTION[i.type]} · {formatDate(i.occurredAt)} alle {formatTime(i.occurredAt)}
                  {i.ownerName && i.visibility === "team" ? ` · ${i.ownerName}` : ""}
                </div>
                {i.summary ? <p className="mt-1 text-sm text-foreground/80">{i.summary}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {hidden > 0 ? (
        <p className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="size-3" aria-hidden />
          {hidden === 1 ? "1 email" : `${hidden} email`} nelle caselle degli altri fondatori. Il contenuto resta privato, al team arrivano
          solo i fatti di lavoro.
        </p>
      ) : null}
    </div>
  );
}
