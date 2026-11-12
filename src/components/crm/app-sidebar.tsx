"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Building2,
  ChevronsUpDown,
  FolderKanban,
  KanbanSquare,
  Lightbulb,
  ListChecks,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Users,
  CheckCheck,
  CalendarDays,
  CalendarRange,
  LogOut,
  Megaphone,
  Video,
  Contact,
  FolderCheck,
  Wallet,
  LineChart,
  ArrowLeftRight,
  FileSignature,
  Truck,
  Landmark,
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

/**
 * Tre aree con il loro menu: CRM (relazioni e vendite), Task (lavoro sui progetti) e Finanza
 * (cassa, contratti, fornitori: solo per i fondatori).
 * L'area si ricava dalla pagina; le pagine comuni (Impostazioni) tengono l'ultima scelta.
 */
type Area = "crm" | "task" | "finanza";
const AREA_PATHS: Record<Area, string[]> = {
  crm: ["/companies", "/people", "/pipeline", "/eventi", "/proposte", "/opportunita", "/da-approvare"],
  task: ["/task", "/progetti", "/calendario", "/meeting"],
  finanza: ["/finanza"],
};
const AREA_HOME: Record<Area, string> = { crm: "/", task: "/task", finanza: "/finanza" };

function areaOf(pathname: string): Area | null {
  if (pathname === "/") return "crm";
  for (const area of ["crm", "task", "finanza"] as const) if (AREA_PATHS[area].some((p) => pathname.startsWith(p))) return area;
  return null;
}

const Count = ({ n }: { n: number }) => (n ? <span className="ml-auto text-xs text-muted-foreground tabular-nums">{n}</span> : null);

export function AppSidebar({
  viewer,
  team,
  counts,
}: {
  viewer: NavUser;
  team: NavUser[];
  counts: { today: number; approvals: number; myTasks: number; suggestions: number; proposals: number };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // Il Previsionale è la radice dell'area: attivo solo su /finanza esatto
  const isExact = (href: string) => pathname === href;
  const finance = viewer.role === "fondatore";
  // L'area segue la pagina aperta; sulle pagine comuni resta quella di prima
  const derived = areaOf(pathname);
  const [area, setArea] = useState<Area>(derived ?? "crm");
  if (derived && derived !== area) setArea(derived);
  const go = (next: Area) => {
    setArea(next);
    if (areaOf(pathname) !== next) router.push(AREA_HOME[next]);
  };

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
        <div role="tablist" aria-label="Area" className={cn("grid gap-0.5 rounded-lg bg-muted p-0.5", finance ? "grid-cols-3" : "grid-cols-2")}>
          {(
            [
              ["crm", "CRM", Contact],
              ["task", "Task", FolderCheck],
              ...(finance ? ([["finanza", "Finanza", Wallet]] as const) : []),
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={area === key}
              onClick={() => go(key)}
              className={cn(
                "flex h-7 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5",
                area === key && "bg-background text-foreground shadow-xs",
              )}
            >
              <Icon aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-4 px-2.5 pt-1">
        {area === "crm" ? (
          <>
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
            </nav>

            <nav className="flex flex-col gap-0.5" aria-label="Registro">
              <span className="label-mono px-2.5 pt-1.5 pb-1 text-[10px]">Registro</span>
              <NavItem href="/companies" label="Aziende" icon={Building2} active={isActive("/companies")} />
              <NavItem href="/people" label="Persone" icon={Users} active={isActive("/people")} />
              <NavItem href="/pipeline" label="Pipeline" icon={KanbanSquare} active={isActive("/pipeline")} />
              <NavItem href="/eventi" label="Eventi" icon={CalendarDays} active={isActive("/eventi")} />
            </nav>

            <nav className="flex flex-col gap-0.5" aria-label="Idee">
              <span className="label-mono px-2.5 pt-1.5 pb-1 text-[10px]">Idee</span>
              <NavItem href="/proposte" label="Proposte" icon={Megaphone} active={isActive("/proposte")} badge={<Count n={counts.proposals} />} />
              <NavItem
                href="/opportunita"
                label="Opportunità suggerite"
                icon={Lightbulb}
                active={isActive("/opportunita")}
                badge={<Count n={counts.suggestions} />}
              />
            </nav>
          </>
        ) : area === "finanza" && finance ? (
          <>
            <nav className="flex flex-col gap-0.5" aria-label="Cassa">
              <NavItem href="/finanza" label="Previsionale" icon={LineChart} active={isExact("/finanza")} />
              <NavItem href="/finanza/movimenti" label="Entrate e uscite" icon={ArrowLeftRight} active={isActive("/finanza/movimenti")} />
              <NavItem href="/finanza/banca" label="Banca" icon={Landmark} active={isActive("/finanza/banca")} />
            </nav>
            <nav className="flex flex-col gap-0.5" aria-label="Con chi">
              <span className="label-mono px-2.5 pt-1.5 pb-1 text-[10px]">Con chi</span>
              <NavItem href="/finanza/contratti" label="Contratti" icon={FileSignature} active={isActive("/finanza/contratti")} />
              <NavItem href="/finanza/fornitori" label="Fornitori" icon={Truck} active={isActive("/finanza/fornitori")} />
            </nav>
          </>
        ) : (
          <nav className="flex flex-col gap-0.5" aria-label="Task e progetti">
            <NavItem href="/task" label="Task" icon={ListChecks} active={isActive("/task")} badge={<Count n={counts.myTasks} />} />
            <NavItem href="/progetti" label="Progetti" icon={FolderKanban} active={isActive("/progetti")} />
            <NavItem href="/calendario" label="Calendario" icon={CalendarRange} active={isActive("/calendario")} />
            <NavItem href="/meeting" label="Meeting" icon={Video} active={isActive("/meeting")} />
          </nav>
        )}
      </SidebarContent>

      <SidebarFooter className="gap-0.5 px-2.5 pb-3">
        <NavItem href="/veloce" label="Inserimento veloce" icon={Smartphone} active={false} />
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
