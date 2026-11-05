"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string; hint?: string };

/** Scelta con ricerca, per liste lunghe come aziende e persone. */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = "Scegli…",
  emptyText = "Nessun risultato",
  allowClear = true,
  createLabel,
  onCreate,
  className,
  defaultOpen = false,
}: {
  id?: string;
  options: ComboOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  allowClear?: boolean;
  /** Mostra "Crea …" con il testo cercato, per aggiungere un'azienda al volo */
  createLabel?: (query: string) => string;
  onCreate?: (query: string) => void;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border bg-background px-2.5 text-left text-sm hover:bg-muted/50",
            className,
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
          {allowClear && selected ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Togli"
              className="text-muted-foreground hover:text-foreground"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(null);
              }}
            >
              <X className="size-3.5" />
            </span>
          ) : (
            <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Cerca…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-3.5", o.value === value ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="truncate">{o.label}</span>
                  {o.hint ? <span className="ml-auto truncate text-xs text-muted-foreground">{o.hint}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
            {onCreate && createLabel && query.trim() ? (
              <CommandGroup>
                <CommandItem
                  value={`__crea__ ${query}`}
                  onSelect={() => {
                    onCreate(query.trim());
                    setOpen(false);
                  }}
                >
                  {createLabel(query.trim())}
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Più valori: utenti assegnati, team di progetto. */
export function MultiPicker({
  options,
  value,
  onChange,
  placeholder = "Nessuno",
}: {
  options: ComboOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const labels = options.filter((o) => value.includes(o.value)).map((o) => o.label);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-8 w-full items-center gap-2 rounded-md border bg-background px-2.5 text-left text-sm hover:bg-muted/50">
          <span className={cn("min-w-0 flex-1 truncate", !labels.length && "text-muted-foreground")}>{labels.join(", ") || placeholder}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((o) => {
                const on = value.includes(o.value);
                return (
                  <CommandItem key={o.value} value={o.label} onSelect={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
                    <Check className={cn("size-3.5", on ? "opacity-100" : "opacity-0")} aria-hidden />
                    {o.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
