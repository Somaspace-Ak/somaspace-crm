"use client";

import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { openCommandMenu } from "./command-menu";
import { CREATE_LABEL, openCreate, type CreateKind } from "./create-dialogs";

/** Il campo di ricerca dell'intestazione: apre la palette Ctrl+K. */
export function HeaderSearch() {
  return (
    <button
      type="button"
      onClick={openCommandMenu}
      className="hidden h-8 w-[220px] items-center gap-1.5 rounded-md border bg-background px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent lg:flex"
    >
      <Search className="size-3.5" aria-hidden />
      Cerca
      <span className="kbd ml-auto">Ctrl K</span>
    </button>
  );
}

/** "Nuovo": crea qualsiasi record da una schermata che non ne ha uno suo. */
export function NewMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus aria-hidden />
          Nuovo
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {(["azienda", "persona", "opportunita", "progetto", "task", "interazione"] as CreateKind[]).map((k) => (
          <DropdownMenuItem key={k} onSelect={() => openCreate(k)}>
            {CREATE_LABEL[k]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
