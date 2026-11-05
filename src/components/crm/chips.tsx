import { Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HEALTH,
  MODE,
  RELATIONSHIP,
  STAGE,
  STRENGTH,
  TASK_STATUS,
  TONE_CLASS,
  DOT_CLASS,
  type Tone,
} from "@/lib/labels";
import { initialsOf } from "@/lib/format";

/** Chip a pillola: sfondo tenue e testo dello stesso colore di stato. */
export function Chip({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full px-2 text-xs leading-none font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Chip con contorno e pallino colorato, per relazione e stage. */
export function LineChip({ tone, className, children }: { tone: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full border px-2 text-xs leading-none font-medium whitespace-nowrap text-foreground",
        className,
      )}
    >
      <Dot tone={tone} />
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", DOT_CLASS[tone])} />;
}

export function StageChip({ stage }: { stage: keyof typeof STAGE }) {
  const s = STAGE[stage];
  return (
    <Chip tone={s.tone}>
      <Dot tone={s.tone} />
      {s.label}
    </Chip>
  );
}

export function ModeChip({ mode }: { mode: keyof typeof MODE | null }) {
  if (!mode) return <span className="text-xs text-muted-foreground">—</span>;
  const m = MODE[mode];
  return <Chip tone={m.tone}>{m.label}</Chip>;
}

export function RelationshipChip({ value }: { value: keyof typeof RELATIONSHIP }) {
  const r = RELATIONSHIP[value];
  return <LineChip tone={r.tone}>{r.label}</LineChip>;
}

export function HealthChip({ value }: { value: keyof typeof HEALTH }) {
  const h = HEALTH[value];
  return (
    <Chip tone={h.tone}>
      <Dot tone={h.tone} />
      {h.label}
    </Chip>
  );
}

export function TaskStatusChip({ value }: { value: keyof typeof TASK_STATUS }) {
  const t = TASK_STATUS[value];
  return <Chip tone={t.tone}>{t.label}</Chip>;
}

/** Forza della relazione: 5 tacche, si legge anche senza colori. */
export function StrengthBar({ value, showLabel = false }: { value: keyof typeof STRENGTH; showLabel?: boolean }) {
  const s = STRENGTH[value];
  const filled = s.level === 0 ? 0 : s.level + 1;
  return (
    <span className="inline-flex items-center gap-2" title={`Forza relazione: ${s.label}`}>
      <span className="inline-flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={cn("block h-3 w-1 rounded-[1px]", n <= filled ? "bg-foreground" : "bg-border")} />
        ))}
      </span>
      {showLabel ? <span className="text-xs text-muted-foreground">{s.label}</span> : <span className="sr-only">{s.label}</span>}
    </span>
  );
}

/** Marcatore discreto per tutto ciò che propone o scrive l'agente. */
export function AgentMark({ label = "Proposto", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 self-start rounded-[4px] bg-brand-bg px-1.5 text-[11px] leading-none font-semibold whitespace-nowrap text-brand",
        className,
      )}
    >
      <Sparkles className="size-3" aria-hidden />
      {label}
    </span>
  );
}

/** Visibile solo a chi possiede la casella. */
export function PrivateMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] whitespace-nowrap text-muted-foreground", className)} title="Visibile solo a te">
      <Lock className="size-3" aria-hidden />
      Solo tu
    </span>
  );
}

export function UserAvatar({ initials, name, className }: { initials: string; name?: string; className?: string }) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold tracking-[0.02em] text-secondary-foreground shadow-[inset_0_0_0_1px_var(--border)]",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function AvatarStack({ users }: { users: { id: string; initials: string; name: string }[] }) {
  if (!users.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex">
      {users.map((u, i) => (
        <UserAvatar key={u.id} initials={u.initials} name={u.name} className={cn("shadow-[0_0_0_2px_var(--background)]", i > 0 && "-ml-1.5")} />
      ))}
    </span>
  );
}

/** Logo aziendale: quadrato con le iniziali. */
export function CompanyLogo({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-[10px] font-semibold tracking-[0.02em] text-secondary-foreground shadow-[inset_0_0_0_1px_var(--border)]",
        className,
      )}
      aria-hidden
    >
      {initialsOf(name) || name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Barra dei 4 passi della sequenza del preventivo. */
export function StepBar({ step, className }: { step: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={`Passo ${step} di 4`}>
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className={cn("block h-1 w-3.5 rounded-sm", n <= step ? "bg-foreground" : "bg-border")} />
      ))}
    </span>
  );
}
