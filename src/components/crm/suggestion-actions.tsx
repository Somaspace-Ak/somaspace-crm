"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { acceptSuggestion, discardSuggestion, runSuggestions } from "@/server/mutations";

/** Accetta aprendo un deal (il caso normale), accetta senza deal, oppure scarta. */
export function SuggestionActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const accept = (withDeal: boolean) =>
    start(async () => {
      const res = await acceptSuggestion(id, withDeal);
      if (!res.ok) return void toast.error(res.error);
      if (res.data.opportunityId) {
        toast.success("Deal aperto in Lead");
        router.push(`/pipeline/${res.data.opportunityId}`);
      } else toast.success("Accettato");
    });
  const discard = () =>
    start(async () => {
      const res = await discardSuggestion(id);
      if (!res.ok) toast.error(res.error);
    });
  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="flex">
        <Button size="sm" className="rounded-r-none" disabled={pending} onClick={() => accept(true)}>
          Apri un deal
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="rounded-l-none border-l border-primary-foreground/20 px-1.5" disabled={pending} aria-label="Altri modi di accettare">
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => accept(false)}>Accetta senza aprire un deal</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Button size="sm" variant="ghost" disabled={pending} onClick={discard}>
        Scarta
      </Button>
    </div>
  );
}

/** Ricalcola subito i suggerimenti, senza aspettare il giro del giorno dopo. */
export function RunSuggestionsButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await runSuggestions();
          if (!res.ok) return void toast.error(res.error);
          const { created, updated, removed } = res.data;
          toast.success(
            created || updated || removed
              ? [created && `${created} nuove`, updated && `${updated} aggiornate`, removed && `${removed} tolte`].filter(Boolean).join(", ")
              : "Niente di nuovo",
          );
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
      {pending ? "Cerco…" : "Cerca adesso"}
    </Button>
  );
}
