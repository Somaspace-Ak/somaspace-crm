"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  Building2,
  ChevronsUpDown,
  FolderKanban,
  KanbanSquare,
  Lightbulb,
  ListChecks,
  Search,
  SlidersHorizontal,
  Sun,
  Users,
  CheckCheck,
  CalendarDays,
  LogOut,
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { authEnabled } from "@/lib/supabase/config";
import { switchViewer } from "@/server/actions";
import { signOut } from "@/server/auth";
import { UserAvatar } from "./chips";
import { openCommandMenu } from "./command-menu";
import { ThemeToggle } from "./theme-toggle";

type NavUser = { id: string; name: string; email: string; initials: string; role?: string };

const itemClass =
  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent [&_svg]:size-4 [&_svg]:shrink-0";

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: typeof Sun;
  active: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(itemClass, active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground")} aria-current={active ? "page" : undefined}>
      <Icon aria-hidden />
      <span className="truncate">{label}</span>
      {badge}
    </Link>
  );
}

const Count = ({ n }: { n: number }) => (n ? <span className="ml-auto text-xs text-muted-foreground tabular-nums">{n}</span> : null);

export function AppSidebar({
  viewer,
  team,
  counts,
}: {
  viewer: NavUser;
  team: NavUser[];
  counts: { today: number; approvals: number; myTasks: number; suggestions: number };
}) {
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-4 px-2.5 pt-3">
        <Link href="/" className="px-2.5 pt-1 text-[17px] tracking-[-0.02em] text-foreground" aria-label="Somaspace, vai a Oggi">
          <span className="font-normal">soma</span>
          <span className="font-bold italic">space</span>.
        </Link>
        <button
          type="button"
          onClick={openCommandMenu}
          className="flex h-8 w-full items-center gap-1.5 rounded-md border bg-background px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent"
        >
          <Search className="size-3.5" aria-hidden />
          Cerca o esegui
          <span className="ml-auto inline-flex gap-0.5">
            <span className="kbd">Ctrl</span>
            <span className="kbd">K</span>
          </span>
        </button>
      </SidebarHeader>

      <SidebarContent className="gap-4 px-2.5 pt-1">
        <nav className="flex flex-col gap-0.5" aria-label="Lavoro di oggi">
          <NavItem
            href="/"
            label="Oggi"
            icon={Sun}
            active={isActive("/")}
            badge={
              counts.today ? (
                <span className="ml-auto inline-flex h-[18px] min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
                  {counts.today}
                </span>
              ) : null
            }
          />
          <NavItem
            href="/da-approvare"
            label="Da approvare"
            icon={CheckCheck}
            active={isActive("/da-approvare")}
            badge={
              counts.approvals ? (
                <span className="ml-auto inline-flex h-[18px] min-w-5 items-center justify-center rounded-full bg-brand-bg px-1.5 text-[11px] font-semibold text-brand tabular-nums">
                  {counts.approvals}
                </span>
              ) : null
            }
          />
          <NavItem href="/task" label="Task" icon={ListChecks} active={isActive("/task")} badge={<Count n={counts.myTasks} />} />
        </nav>

        <nav className="flex flex-col gap-0.5" aria-label="Registro">
          <span className="label-mono px-2.5 pt-1.5 pb-1 text-[10px]">Registro</span>
          <NavItem href="/companies" label="Aziende" icon={Building2} active={isActive("/companies")} />
          <NavItem href="/people" label="Persone" icon={Users} active={isActive("/people")} />
          <NavItem href="/pipeline" label="Pipeline" icon={KanbanSquare} active={isActive("/pipeline")} />
          <NavItem href="/progetti" label="Progetti" icon={FolderKanban} active={isActive("/progetti")} />
          <NavItem href="/eventi" label="Eventi" icon={CalendarDays} active={isActive("/eventi")} />
        </nav>

        <nav className="flex flex-col gap-0.5" aria-label="Intelligenza">
          <span className="label-mono px-2.5 pt-1.5 pb-1 text-[10px]">Intelligenza</span>
          <NavItem
            href="/opportunita"
            label="Opportunità suggerite"
            icon={Lightbulb}
            active={isActive("/opportunita")}
            badge={<Count n={counts.suggestions} />}
          />
        </nav>
      </SidebarContent>

      <SidebarFooter className="gap-0.5 px-2.5 pb-3">
        <NavItem href="/impostazioni" label="Impostazioni" icon={SlidersHorizontal} active={isActive("/impostazioni")} />
        <ThemeToggle className={cn(itemClass, "w-full text-left")} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={pending} className={cn(itemClass, "h-11 w-full text-left disabled:opacity-60")}>
              <UserAvatar initials={viewer.initials} />
              <span className="flex min-w-0 flex-col leading-4">
                <span className="truncate text-[13px] font-medium">{viewer.name.split(" ")[0]}</span>
                <span className="truncate text-xs text-muted-foreground">Fondatore</span>
              </span>
              <ChevronsUpDown className="ml-auto !size-3.5 text-muted-foreground" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            {authEnabled ? (
              <>
                <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
                  <span className="text-[13px] font-medium">{viewer.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{viewer.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => start(() => signOut())}>
                  <LogOut aria-hidden />
                  Esci
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  In locale: entra come un altro fondatore per vedere la privacy tra caselle
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {team.map((u) => (
                  <DropdownMenuItem key={u.id} onSelect={() => start(() => switchViewer(u.email))} disabled={u.id === viewer.id}>
                    <UserAvatar initials={u.initials} />
                    {u.name}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
