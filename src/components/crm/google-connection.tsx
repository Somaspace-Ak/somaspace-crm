"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { disconnectGoogle, syncMyGoogle } from "@/server/mutations";
import { UserAvatar } from "./chips";

const FLASH: Record<string, { ok: boolean; text: string }> = {
  collegato: { ok: true, text: "Google collegato. La prima lettura di Gmail e Calendar è partita: ci vuole qualche minuto." },
  annullato: { ok: false, text: "Collegamento annullato." },
  errore: { ok: false, text: "Collegamento non riuscito. Riprova." },
  "account-diverso": { ok: false, text: "Hai scelto un account Google diverso dal tuo: ognuno collega solo la propria casella." },
  "permessi-mancanti": { ok: false, text: "Servono sia Gmail sia Calendar: riprova lasciando spuntati tutti i permessi." },
  "non-configurato": { ok: false, text: "Google non è ancora configurato sul server (mancano le chiavi)." },
};

const when = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

export function GoogleConnection({
  configured,
  flash,
  mine,
  team,
}: {
  configured: boolean;
  flash: string | null;
  mine: { email: string; connectedAt: Date; gmailSyncedAt: Date | null; calendarSyncedAt: Date | null; lastError: string | null } | null;
  team: { id: string; name: string; initials: string; connected: boolean }[];
}) {
  const [pending, start] = useTransition();
  const message = flash ? FLASH[flash] : null;

  const sync = () =>
    start(async () => {
      const res = await syncMyGoogle();
      if (!res.ok) return void toast.error(res.error);
      const { recorded, proposed, events, more } = res.data;
      toast.success(
        `${recorded} email registrate, ${proposed} contatti nuovi in Da approvare, ${events} eventi` + (more ? ". Ce ne sono altre: rilancia o aspetta il prossimo giro" : ""),
      );
    });
  const disconnect = () => {
    if (!confirm("Scollegare Google? Gli eventi del calendario spariscono dal CRM; le email già registrate restano, private.")) return;
    start(async () => {
      const res = await disconnectGoogle();
      if (res.ok) toast.success("Google scollegato");
      else toast.error(res.error);
    });
  };

  return (
    <div className="overflow-hidden rounded-[10px] border bg-card">
      {message ? (
        <p role="status" className={message.ok ? "bg-ok-bg px-4 py-2.5 text-[13px] text-ok" : "bg-bad-bg px-4 py-2.5 text-[13px] text-bad"}>
          {message.text}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 px-4 py-3.5 text-[13px]">
        {mine ? (
          <>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">Collegato come {mine.email}</span>
              <span className="text-xs text-muted-foreground">
                Gmail in sola lettura e Google Calendar. Ultima lettura:{" "}
                {mine.calendarSyncedAt ? when.format(mine.calendarSyncedAt) : "in corso"}. Si aggiorna da sola ogni 30 minuti.
              </span>
              {mine.lastError ? <span className="text-xs text-bad">Ultimo errore: {mine.lastError}</span> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={sync}>
                <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
                {pending ? "Leggo…" : "Sincronizza ora"}
              </Button>
              {mine.lastError ? (
                <Button size="sm" asChild>
                  <a href="/api/google/connect">Ricollega</a>
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" disabled={pending} onClick={disconnect}>
                Scollega
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              Collega la tua casella e il tuo calendario. Il CRM legge le email con i contatti, propone i mittenti nuovi in Da approvare e
              mostra le riunioni nel Calendario. Non invia, non modifica e non cancella niente. Il contenuto delle email resta visibile solo a te.
            </p>
            <div>
              {configured ? (
                <Button size="sm" asChild>
                  <a href="/api/google/connect">Collega Gmail e Calendar</a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Google non è ancora configurato sul server.</span>
              )}
            </div>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t bg-muted px-4 py-2.5 text-xs text-muted-foreground">
        {team.map((u) => (
          <span key={u.id} className="inline-flex items-center gap-1.5">
            <UserAvatar initials={u.initials} name={u.name} />
            {u.name.split(" ")[0]}: {u.connected ? "collegato" : "non collegato"}
          </span>
        ))}
      </div>
    </div>
  );
}
