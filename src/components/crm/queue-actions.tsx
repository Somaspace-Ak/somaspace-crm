"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { BellOff, Check, Clock, Mail, MoreHorizontal, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { changeMode, markFollowupDone, moveOpportunity, snoozeBy } from "@/server/actions";
import { prepareFollowupEmail } from "@/server/drafts";

type Kind = "persona" | "opportunita";

export function QueueActions({
  kind,
  id,
  href,
  hasDraft,
  askOutcome,
}: {
  kind: Kind;
  id: string;
  href: string;
  hasDraft: boolean;
  askOutcome: boolean;
}) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, message: string) =>
    start(async () => {
      await fn();
      toast.success(message);
    });

  if (askOutcome) {
    return (
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => moveOpportunity(id, "persa", { lostReason: "nessuna_risposta" }), "Segnata come persa: nessuna risposta")}
        >
          <XCircle aria-hidden />
          Persa
        </Button>
        <SnoozeMenu kind={kind} id={id} disabled={pending} run={run} label="Rimanda" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {hasDraft ? <DraftButton kind={kind} id={id} /> : null}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => markFollowupDone(kind, id), "Segnato come fatto, data ricalcolata")}>
        <Check aria-hidden />
        <span className="hidden sm:inline">Fatto</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" disabled={pending} aria-label="Altre azioni">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {kind === "persona" ? (
            <>
              <DropdownMenuItem
                onSelect={() =>
                  start(async () => {
                    const before = await changeMode(id, "nessuno");
                    toast.success("Follow-up cancellato: non comparirà più in Oggi", {
                      action: { label: "Annulla", onClick: () => void changeMode(id, before) },
                    });
                  })
                }
              >
                <BellOff aria-hidden />
                Cancella follow-up
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : (
            <>
              <DropdownMenuItem
                onSelect={() => run(() => moveOpportunity(id, "persa", { lostReason: "nessuna_risposta" }), "Segnata come persa: i follow-up si fermano")}
              >
                <XCircle aria-hidden />
                Segna persa e ferma i follow-up
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Rimanda</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => run(() => snoozeBy(kind, id, 7), "Rimandato di una settimana")}>
            <Clock aria-hidden />1 settimana
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => snoozeBy(kind, id, 30), "Rimandato di un mese")}>
            <Clock aria-hidden />1 mese
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => snoozeBy(kind, id, 90), "Rimandato di tre mesi")}>
            <Clock aria-hidden />3 mesi
          </DropdownMenuItem>
          {kind === "persona" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Cambia modalità</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onSelect={() => run(() => changeMode(id, "caldo"), "Ora è Caldo: ogni 30 giorni")}>Caldo</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(() => changeMode(id, "freddo"), "Ora è Freddo: ogni 90 giorni")}>Freddo</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={href}>Apri scheda</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SnoozeMenu({
  kind,
  id,
  disabled,
  run,
  label,
}: {
  kind: Kind;
  id: string;
  disabled: boolean;
  run: (fn: () => Promise<unknown>, message: string) => void;
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" disabled={disabled}>
          <Clock aria-hidden />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => run(() => snoozeBy(kind, id, 7), "Rimandato di una settimana")}>1 settimana</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run(() => snoozeBy(kind, id, 30), "Rimandato di un mese")}>1 mese</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run(() => snoozeBy(kind, id, 90), "Rimandato di tre mesi")}>3 mesi</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Claude scrive la mail dallo storico del contatto, poi si apre una finestra di Gmail già compilata.
 * La finestra si apre subito al clic (i browser bloccano quelle aperte dopo un'attesa) e si riempie quando la bozza è pronta.
 */
function DraftButton({ kind, id }: { kind: Kind; id: string }) {
  const [pending, start] = useTransition();
  const open = () => {
    const w = window.open("", "gmail-bozza", "popup,width=760,height=720");
    if (w) {
      w.document.title = "Preparo la bozza…";
      w.document.body.innerHTML = '<p style="font:15px system-ui;padding:24px;color:#555">Sto scrivendo la bozza…</p>';
    }
    start(async () => {
      const res = await prepareFollowupEmail({ kind, id });
      if (!res.ok) {
        w?.close();
        toast.error(res.error);
        return;
      }
      const { to, subject, body, account } = res.data;
      const q = new URLSearchParams({ ...(account ? { authuser: account } : {}), view: "cm", fs: "1", tf: "1", to, su: subject, body });
      const url = `https://mail.google.com/mail/?${q.toString()}`;
      if (w && !w.closed) w.location.href = url;
      else window.open(url, "_blank");
    });
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="sm" variant="outline" disabled={pending} onClick={open}>
          <Mail aria-hidden />
          {pending ? "Scrivo…" : "Apri bozza"}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Claude scrive la mail dallo storico, si apre in Gmail da rivedere e inviare</TooltipContent>
    </Tooltip>
  );
}
