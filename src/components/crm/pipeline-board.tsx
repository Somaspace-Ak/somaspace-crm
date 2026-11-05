"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { moveOpportunity } from "@/server/actions";
import type { PipelineCard } from "@/server/queries";
import { formatEuro } from "@/lib/format";
import { LOST_REASON, STAGE } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Chip, CompanyLogo, Dot, StepBar, UserAvatar } from "./chips";

type Stage = keyof typeof STAGE;
const STAGES: Stage[] = ["lead", "in_progress", "vinta", "persa"];

type Pending = { card: PipelineCard; to: Stage } | null;

export function PipelineBoard({ cards: initial, today }: { cards: PipelineCard[]; today: string }) {
  const [cards, setCards] = useState(initial);
  const [pending, setPending] = useState<Pending>(null);
  const [saving, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const commit = (card: PipelineCard, to: Stage, extra: Parameters<typeof moveOpportunity>[2] = {}) => {
    const before = cards;
    // Lo schermo cambia subito, il salvataggio segue
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, stage: to, value: extra?.finalValue ?? c.value } : c)));
    setPending(null);
    start(async () => {
      const res = await moveOpportunity(card.id, to, extra);
      if (!res?.ok) {
        setCards(before);
        toast.error(res?.error ?? "Spostamento non riuscito");
        return;
      }
      toast.success(
        to === "vinta" ? `${card.name} vinta: progetto creato e azienda passata a Cliente` : `${card.name} spostata in ${STAGE[to].label}`,
      );
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const to = e.over?.id as Stage | undefined;
    const card = cards.find((c) => c.id === e.active.id);
    if (!to || !card || card.stage === to) return;
    // Ogni stage chiede il suo dato obbligatorio
    if (to === "vinta" || to === "persa" || (to === "in_progress" && !card.quoteSentOn)) setPending({ card, to });
    else commit(card, to);
  };

  return (
    <>
      {/* id fisso: gli id di accessibilità coincidono tra server e browser */}
      <DndContext id="pipeline" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid min-w-[1080px] grid-cols-4 items-start gap-4">
          {STAGES.map((stage) => {
            const col = cards.filter((c) => c.stage === stage);
            const total = col.reduce((sum, c) => sum + (c.value ?? 0), 0);
            return (
              <Column key={stage} stage={stage} count={col.length} total={total}>
                {col.map((c) => (
                  <Card key={c.id} card={c} today={today} disabled={saving} />
                ))}
              </Column>
            );
          })}
        </div>
      </DndContext>
      <StageDialog pending={pending} onCancel={() => setPending(null)} onConfirm={commit} />
    </>
  );
}

function Column({ stage, count, total, children }: { stage: Stage; count: number; total: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const tone = STAGE[stage].tone;
  return (
    <section
      ref={setNodeRef}
      aria-label={STAGE[stage].label}
      className={cn(
        "flex min-h-[60vh] flex-col gap-2 rounded-xl p-2 transition-colors",
        isOver && "bg-brand-bg shadow-[inset_0_0_0_1.5px_var(--ring)]",
      )}
    >
      <header className="flex items-center gap-2 px-1 pt-1 pb-1.5">
        <Chip tone={tone}>
          <Dot tone={tone} />
          {STAGE[stage].label}
        </Chip>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
        <span className="ml-auto text-[13px] font-semibold tabular-nums">{formatEuro(total)}</span>
      </header>
      {children}
    </section>
  );
}

function Card({ card, today, disabled }: { card: PipelineCard; today: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const due = card.stage === "in_progress" && card.nextFollowupOn && card.nextFollowupOn <= today;
  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "flex cursor-grab flex-col gap-2 rounded-[10px] border bg-card p-3 shadow-xs active:cursor-grabbing",
        isDragging && "z-10 -rotate-2 border-ring shadow-crm-lg",
      )}
    >
      <div className="flex justify-between gap-2">
        <Link href={`/pipeline/${card.id}`} className="text-[13px] leading-snug font-semibold hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          {card.name}
        </Link>
        <span className="text-[13px] font-medium whitespace-nowrap tabular-nums">{formatEuro(card.value)}</span>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <CompanyLogo name={card.company} className="size-[18px] rounded text-[8px]" />
        <span className="truncate">{card.company}</span>
        {card.owner ? <UserAvatar initials={card.owner} className="ml-auto size-5 text-[8px]" /> : null}
      </span>
      {card.stage === "in_progress" ? (
        <div className="flex items-center gap-2">
          <StepBar step={Math.min(card.step, 4)} />
          <span className="text-xs text-muted-foreground">Passo {Math.min(card.step, 4)} di 4</span>
          {card.daysSinceQuote != null ? (
            <Chip tone={due ? "bad" : "neutral"} className="ml-auto h-5">
              {card.daysSinceQuote} g
            </Chip>
          ) : null}
        </div>
      ) : null}
      {card.stage === "persa" && card.lostReason ? <span className="text-xs text-muted-foreground">{LOST_REASON[card.lostReason]}</span> : null}
    </article>
  );
}

function StageDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: Pending;
  onCancel: () => void;
  onConfirm: (card: PipelineCard, to: Stage, extra: Parameters<typeof moveOpportunity>[2]) => void;
}) {
  return (
    <Dialog open={pending !== null} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        {pending ? <StageForm key={`${pending.card.id}-${pending.to}`} pending={pending} onCancel={onCancel} onConfirm={onConfirm} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function StageForm({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: NonNullable<Pending>;
  onCancel: () => void;
  onConfirm: (card: PipelineCard, to: Stage, extra: Parameters<typeof moveOpportunity>[2]) => void;
}) {
  const [value, setValue] = useState(pending.card.value ? String(pending.card.value) : "");
  const [reason, setReason] = useState<keyof typeof LOST_REASON | "">("");
  const [date, setDate] = useState("");
  const to = pending.to;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (to === "vinta") onConfirm(pending.card, to, { finalValue: Number(value) });
    else if (to === "persa" && reason) onConfirm(pending.card, to, { lostReason: reason });
    else if (to === "in_progress") onConfirm(pending.card, to, { quoteSentOn: date });
  };

  const valid = to === "vinta" ? Number(value) > 0 : to === "persa" ? Boolean(reason) : Boolean(date);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{to === "vinta" ? "Deal vinto" : to === "persa" ? "Deal perso" : "Preventivo inviato"}</DialogTitle>
        <DialogDescription>
          {to === "vinta"
            ? "Inserisci l'importo chiuso. Il progetto si apre da solo, senza importi."
            : to === "persa"
              ? "Perché non è andata? Serve per capire cosa riprendere più avanti."
              : "Da questa data parte la sequenza di follow-up a 3, 7, 14 e 30 giorni."}
        </DialogDescription>
      </DialogHeader>
      {to === "vinta" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="final-value">Valore finale (€)</Label>
          <Input id="final-value" type="number" min={1} step="any" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </div>
      ) : to === "persa" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="lost-reason">Motivo</Label>
          <Select value={reason} onValueChange={(v) => setReason(v as keyof typeof LOST_REASON)}>
            <SelectTrigger id="lost-reason" className="w-full">
              <SelectValue placeholder="Scegli un motivo" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LOST_REASON).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="quote-date">Data di invio del preventivo</Label>
          <Input id="quote-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="submit" disabled={!valid}>
          {to === "vinta" ? "Segna come vinta" : to === "persa" ? "Segna come persa" : "Sposta in In progress"}
        </Button>
      </DialogFooter>
    </form>
  );
}
