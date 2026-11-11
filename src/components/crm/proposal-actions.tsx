"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decideProposal, withdrawProposal } from "@/server/mutations";

/**
 * Su una proposta aperta: "Ricontattiamo" apre il task per chi segue il contatto, "Scarta" la chiude.
 * Chi l'ha proposta può anche ritirarla.
 */
export function ProposalActions({ id, contact, mine }: { id: string; contact: string; mine: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [deciding, setDeciding] = useState<"approvata" | "scartata" | null>(null);
  const [note, setNote] = useState("");

  const decide = () =>
    start(async () => {
      if (!deciding) return;
      const res = await decideProposal(id, deciding, note);
      if (!res.ok) return void toast.error(res.error);
      setDeciding(null);
      if (res.data.taskId) {
        toast.success(`Task creato: Ricontattare ${contact}`, {
          action: { label: "Apri i task", onClick: () => router.push("/task?vista=team") },
        });
      } else toast.success("Proposta scartata");
    });

  const withdraw = () =>
    start(async () => {
      const res = await withdrawProposal(id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Proposta ritirata");
    });

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button size="sm" disabled={pending} onClick={() => setDeciding("approvata")}>
          <Check aria-hidden />
          Ricontattiamo
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDeciding("scartata")}>
          <X aria-hidden />
          Scarta
        </Button>
        {mine ? (
          <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={pending} onClick={withdraw}>
            Ritira
          </Button>
        ) : null}
      </div>
      <Dialog open={deciding !== null} onOpenChange={(o) => !o && setDeciding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{deciding === "approvata" ? `Ricontattiamo ${contact}` : `Scarta la proposta su ${contact}`}</DialogTitle>
            <DialogDescription>
              {deciding === "approvata"
                ? "Si crea il task \"Ricontattare\" per chi segue il contatto, con il perché e l'idea nella descrizione. Scadenza fra tre giorni."
                : "La proposta resta nello storico, tra le decise."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`note-${id}`} className="text-xs text-muted-foreground">
              Nota della decisione (facoltativa)
            </Label>
            <Textarea
              id={`note-${id}`}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={deciding === "approvata" ? "Es. Lo sente Michele dopo la fiera" : "Es. Hanno appena firmato con un altro studio"}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeciding(null)}>
              Annulla
            </Button>
            <Button disabled={pending} variant={deciding === "scartata" ? "outline" : "default"} onClick={decide}>
              {deciding === "approvata" ? "Crea il task" : "Scarta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
