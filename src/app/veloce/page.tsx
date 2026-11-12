import type { Metadata, Viewport } from "next";
import { desc, isNotNull } from "drizzle-orm";
import { Suspense } from "react";
import { QuickCapture } from "@/components/crm/quick-capture";
import { db } from "@/db";
import { events } from "@/db/schema";
import { getFormOptions } from "@/server/queries";
import { aiEnabled } from "@/server/ai";
import { transcriptionEnabled } from "@/server/transcribe";
import { getViewer } from "@/server/session";

export const metadata: Metadata = { title: "Inserimento veloce" };
export const viewport: Viewport = { themeColor: "#0e0f11", width: "device-width", initialScale: 1, viewportFit: "cover" };

// Biglietto da visita e recap passano da Claude: una conversazione lunga può chiedere un paio di minuti
export const maxDuration = 300;

export default function QuickPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      <Suspense fallback={<div className="m-4 h-96 animate-pulse rounded-xl bg-muted" />}>
        <Quick />
      </Suspense>
    </main>
  );
}

async function Quick() {
  const { viewer } = await getViewer();
  const [options, recentEvents] = await Promise.all([
    getFormOptions(),
    db.select({ id: events.id, name: events.name, date: events.date }).from(events).where(isNotNull(events.name)).orderBy(desc(events.date), desc(events.createdAt)).limit(30),
  ]);
  return (
    <QuickCapture
      viewerName={viewer.name.split(" ")[0]}
      ai={aiEnabled}
      transcribe={transcriptionEnabled}
      companies={options.companies}
      events={recentEvents.map((e) => ({ id: e.id, name: e.name, date: e.date }))}
    />
  );
}
