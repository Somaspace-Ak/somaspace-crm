import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Chip, UserAvatar } from "@/components/crm/chips";
import { ConversionStats } from "@/components/crm/event-stats";
import { EmptyState, PageHeader, PageSkeleton, Section } from "@/components/crm/page-header";
import { Breadcrumb } from "@/components/crm/record";
import { formatDateYear, initialsOf } from "@/lib/format";
import { getEvent } from "@/server/queries";
import { getViewer } from "@/server/session";

export default function EventPage(props: PageProps<"/eventi/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Event {...props} />
    </Suspense>
  );
}

async function Event({ params }: PageProps<"/eventi/[id]">) {
  const { id } = await params;
  await getViewer();
  const data = await getEvent(id);
  if (!data) notFound();
  const { event: e } = data;
  const details = [e.date ? formatDateYear(e.date) : null, e.kind, e.country].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title={e.name}
        description={details}
        breadcrumb={<Breadcrumb items={[{ label: "Eventi", href: "/eventi" }, { label: e.name }]} />}
      />
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <ConversionStats met={data.met} opportunity={data.opportunity} clients={data.clients} rate={data.rate} />
        <Section title="Persone incontrate" count={data.people.length}>
          {data.people.length ? (
            <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
              {data.people.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <UserAvatar initials={initialsOf(x.name)} />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <Link href={`/people/${x.id}`} className="truncate font-medium hover:underline">
                      {x.name}
                    </Link>
                    <span className="truncate text-xs text-muted-foreground">
                      {[x.position, x.company?.name].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {x.client ? <Chip tone="ok">Cliente</Chip> : x.opportunity ? <Chip tone="brand">Opportunità</Chip> : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Nessuna persona collegata. Si collegano dalla scheda della persona, nel campo Evento.</EmptyState>
          )}
        </Section>
      </div>
    </>
  );
}
