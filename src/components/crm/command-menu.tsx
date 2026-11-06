"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Building2,
  CalendarRange,
  CheckSquare,
  FolderKanban,
  Inbox,
  KanbanSquare,
  Lightbulb,
  Plus,
  Sun,
  User,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { CREATE_LABEL, openCreate, type CreateKind } from "./create-dialogs";

type Entry = {
  group: string;
  id: string;
  label: string;
  hint: string;
  href: string;
};

const OPEN_EVENT = "crm:open-command";
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const GROUP_ICON: Record<string, typeof Building2> = {
  Aziende: Building2,
  Persone: User,
  Opportunità: KanbanSquare,
  Progetti: FolderKanban,
};

const PAGES = [
  { label: "Oggi", href: "/", icon: Sun },
  { label: "Da approvare", href: "/da-approvare", icon: Inbox },
  { label: "Task", href: "/task", icon: CheckSquare },
  { label: "Calendario", href: "/calendario", icon: CalendarRange },
  { label: "Pipeline", href: "/pipeline", icon: KanbanSquare },
  { label: "Opportunità suggerite", href: "/opportunita", icon: Lightbulb },
];

export function CommandMenu({ entries }: { entries: Entry[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const groups = [...new Set(entries.map((e) => e.group))];

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Cerca nel CRM"
      description="Aziende, persone, deal e progetti"
    >
      {/* La finestra non crea il contesto di ricerca: senza <Command> il campo va in errore */}
      <Command>
        <CommandInput placeholder="Cerca aziende, persone, deal, progetti…" />
        <CommandList>
          <CommandEmpty>Nessun risultato.</CommandEmpty>
          <CommandGroup heading="Vai a">
            {PAGES.map((p) => (
              <CommandItem
                key={p.href}
                value={`pagina ${p.label}`}
                onSelect={() => go(p.href)}
              >
                <p.icon aria-hidden />
                {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Crea">
            {(
              [
                "azienda",
                "persona",
                "opportunita",
                "progetto",
                "task",
                "interazione",
              ] as CreateKind[]
            ).map((k) => (
              <CommandItem
                key={k}
                value={`crea nuovo ${CREATE_LABEL[k]}`}
                onSelect={() => {
                  setOpen(false);
                  openCreate(k);
                }}
              >
                <Plus aria-hidden />
                {CREATE_LABEL[k]}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          {groups.map((g) => {
            const Icon = GROUP_ICON[g] ?? Building2;
            return (
              <CommandGroup key={g} heading={g}>
                {entries
                  .filter((e) => e.group === g)
                  .map((e) => (
                    <CommandItem
                      key={e.id}
                      value={`${e.label} ${e.hint} ${e.id}`}
                      onSelect={() => go(e.href)}
                    >
                      <Icon aria-hidden />
                      <span>{e.label}</span>
                      {e.hint ? (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {e.hint}
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
