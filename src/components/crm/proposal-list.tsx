import Link from "next/link";
import { Chip, UserAvatar } from "@/components/crm/chips";
import { formatDate, fullName, relativeDay } from "@/lib/format";
import type { ProposalRow } from "@/server/queries";
import { ProposalActions } from "./proposal-actions";

/** Le proposte di ricontatto: chi propone, chi risentire, perché e con quale idea. */
export function ProposalList({ rows, viewerId, compact }: { rows: ProposalRow[]; viewerId: string; compact?: boolean }) {
  return (
    <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
      {rows.map(({ r, person, company, proposer, decider, task }) => {
        const contact = person ? fullName(person) : (company?.name ?? "Contatto");
        const isOpen = r.status === "aperta";
        return (
          <li key={r.id} className="flex flex-col gap-3 px-3.5 py-3.5 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <UserAvatar initials={proposer.initials} name={proposer.name} />
                <span className="text-muted-foreground">
                  {proposer.id === viewerId ? (
                    <>
                      <span className="font-medium text-foreground">Hai proposto</span> di risentire
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-foreground">{proposer.name.split(" ")[0]}</span> propone di risentire
                    </>
                  )}
                </span>
                {compact ? null : (
                  <>
                    {person ? (
                      <Link href={`/people/${person.id}`} className="font-medium hover:underline">
                        {fullName(person)}
                      </Link>
                    ) : null}
                    {company ? (
                      <Link href={`/companies/${company.id}`} className={person ? "text-muted-foreground hover:underline" : "font-medium hover:underline"}>
                        {person ? `· ${company.name}` : company.name}
                      </Link>
                    ) : null}
                  </>
                )}
                <span className="text-xs text-muted-foreground first-letter:uppercase">· {relativeDay(r.createdAt)}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{r.reason}</p>
              {r.idea ? (
                <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-[13px] whitespace-pre-wrap">
                  <span className="font-medium">Idea: </span>
                  {r.idea}
                </p>
              ) : null}
              {isOpen ? null : (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Chip tone={r.status === "approvata" ? "ok" : "neutral"}>{r.status === "approvata" ? "Ricontattiamo" : "Scartata"}</Chip>
                  <span>
                    {decider ? `da ${decider.name.split(" ")[0]}` : ""} {r.decidedAt ? `il ${formatDate(r.decidedAt)}` : ""}
                  </span>
                  {task ? <span>· task {task.status === "fatto" ? "fatto" : "aperto"}: {task.title}</span> : null}
                  {r.decisionNote ? <span className="w-full text-foreground/80">“{r.decisionNote}”</span> : null}
                </div>
              )}
            </div>
            {isOpen ? <ProposalActions id={r.id} contact={contact} mine={proposer.id === viewerId} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
