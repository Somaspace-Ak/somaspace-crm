import { Suspense } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/crm/app-sidebar";
import { CommandMenu } from "@/components/crm/command-menu";
import { CreateDialogs } from "@/components/crm/create-dialogs";
import { FormOptionsBridge } from "@/components/crm/form-options";
import { TaskSheet } from "@/components/crm/task-sheet";
import { getFormOptions, getNavCounts, getSearchIndex } from "@/server/queries";
import { getViewer } from "@/server/session";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <Suspense fallback={<div className="hidden w-64 shrink-0 bg-sidebar md:block" />}>
        <Navigation />
      </Suspense>
      <SidebarInset className="min-w-0">{children}</SidebarInset>
      <CreateDialogs />
      <TaskSheet />
    </SidebarProvider>
  );
}

async function Navigation() {
  const { viewer, team } = await getViewer();
  const [counts, entries, options] = await Promise.all([getNavCounts(viewer), getSearchIndex(), getFormOptions()]);
  const toNav = (u: typeof viewer) => ({ id: u.id, name: u.name, email: u.email, initials: u.initials });
  return (
    <>
      <AppSidebar viewer={toNav(viewer)} team={team.filter((u) => u.active).map(toNav)} counts={counts} />
      <CommandMenu entries={entries} />
      <FormOptionsBridge options={options} />
    </>
  );
}
