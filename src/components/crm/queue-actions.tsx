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
      {hasDraft ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button size="sm" variant="outline" disabled>
                <Mail aria-hidden />
                Apri bozza
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Le bozze in Gmail arrivano quando colleghiamo le caselle (fase 4)</TooltipContent>
        </Tooltip>
      ) : null}
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
