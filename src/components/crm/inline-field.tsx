"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { updateField, type Entity, type FieldValue } from "@/server/mutations";
import { Combobox, type ComboOption } from "./combobox";
import { useFormOptions } from "./form-options";

type FieldType = "text" | "textarea" | "url" | "email" | "number" | "date" | "tags" | "select" | "user" | "company" | "person" | "project";

/**
 * Un campo della scheda che si modifica al clic, come in Attio.
 * Il valore si salva subito nel database; la pagina si aggiorna da sola.
 */
export function InlineField({
  entity,
  id,
  field,
  value,
  type = "text",
  options,
  nullable = true,
  placeholder = "Aggiungi",
  children,
  className,
  onSaved,
}: {
  entity: Entity;
  id: string;
  field: string;
  value: string | number | string[] | null;
  type?: FieldType;
  /** Per type="select": i valori ammessi */
  options?: ComboOption[];
  nullable?: boolean;
  placeholder?: string;
  /** Come mostrare il valore quando non si modifica */
  children?: React.ReactNode;
  className?: string;
  /** Per chi mostra il valore fuori dalla pagina (il pannello dei task) */
  onSaved?: (value: FieldValue) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const lists = useFormOptions();

  const save = (next: FieldValue) => {
    setEditing(false);
    if (JSON.stringify(next) === JSON.stringify(value ?? null)) return;
    start(async () => {
      const res = await updateField(entity, id, field, next);
      if (!res.ok) toast.error(res.error);
      else onSaved?.(next);
    });
  };

  const pickOptions: ComboOption[] | undefined =
    type === "select"
      ? options
      : type === "user"
        ? lists.users.map((u) => ({ value: u.id, label: u.name }))
        : type === "company"
          ? lists.companies.map((c) => ({ value: c.id, label: c.name }))
          : type === "person"
            ? lists.people.map((p) => ({ value: p.id, label: p.name }))
            : type === "project"
              ? lists.projects.map((p) => ({ value: p.id, label: p.name }))
              : undefined;

  if (editing && pickOptions) {
    return (
      <Combobox
        options={pickOptions}
        value={typeof value === "string" ? value : null}
        allowClear={nullable}
        defaultOpen
        onChange={(v) => save(v)}
        className="h-7"
      />
    );
  }

  if (editing) {
    const initial = Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value);
    const commit = (raw: string) => {
      if (type === "tags") save(raw.split(",").map((t) => t.trim()).filter(Boolean));
      else if (type === "number") save(raw.trim() ? Number(raw.replace(/\./g, "").replace(",", ".")) : null);
      else save(raw.trim() || (nullable ? null : raw));
    };
    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Escape") setEditing(false);
      if (e.key === "Enter" && (type !== "textarea" || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit(e.currentTarget.value);
      }
    };
    if (type === "textarea") {
      return (
        <Textarea
          autoFocus
          defaultValue={initial}
          rows={4}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          className="text-[13px]"
        />
      );
    }
    return (
      <Input
        autoFocus
        type={type === "date" ? "date" : type === "email" ? "email" : "text"}
        inputMode={type === "number" ? "decimal" : undefined}
        defaultValue={initial}
        placeholder={type === "tags" ? "Separati da virgola" : undefined}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        className="h-7 text-[13px]"
      />
    );
  }

  const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={pending}
      className={cn(
        "group -mx-1.5 flex w-[calc(100%+0.75rem)] min-w-0 items-start gap-1.5 rounded-md px-1.5 py-0.5 text-left hover:bg-muted/70 disabled:opacity-60",
        className,
      )}
    >
      <span className={cn("min-w-0 flex-1 break-words", empty && "text-muted-foreground")}>
        {empty ? placeholder : (children ?? (Array.isArray(value) ? value.join(", ") : String(value)))}
      </span>
      <Pencil className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" aria-hidden />
    </button>
  );
}
