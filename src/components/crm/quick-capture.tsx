"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { Camera, Check, Download, Loader2, Mic, RotateCcw, ScanText, Sparkles, Square, Upload, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { speakerTurns, type ScribeResponse } from "@/lib/transcript";
import { quickSave, type QuickSaved, recapNote, scanBusinessCard, startTranscription } from "@/server/quick-actions";

/**
 * Inserimento veloce dal telefono, a un evento:
 * 1. foto del biglietto (fronte e retro) → Claude compila persona e azienda;
 * 2. dettatura della conversazione (riconoscimento vocale del telefono) → Claude fa il recap;
 * 3. un tasto: azienda, persona, nota con trascrizione e task finiscono nel CRM.
 * La bozza resta nel telefono finché non si salva: se la pagina si ricarica non si perde niente.
 */

type Option = { id: string; name: string };
type EventOption = Option & { date: string | null };
type Mode = "caldo" | "freddo" | "nessuno";
type Step = { title: string; dueInDays: number; on: boolean };
type Shot = { mediaType: "image/jpeg"; data: string; preview: string };

type Draft = {
  firstName: string;
  lastName: string;
  position: string;
  email: string;
  phone: string;
  linkedin: string;
  companyName: string;
  website: string;
  country: string;
  other: string;
  transcript: string;
  recap: string;
  noteTitle: string;
  steps: Step[];
  interests: string[];
  mode: Mode | null;
};

const EMPTY: Draft = {
  firstName: "",
  lastName: "",
  position: "",
  email: "",
  phone: "",
  linkedin: "",
  companyName: "",
  website: "",
  country: "",
  other: "",
  transcript: "",
  recap: "",
  noteTitle: "",
  steps: [],
  interests: [],
  mode: null,
};

const DRAFT_KEY = "crm-veloce-bozza";
const EVENT_KEY = "crm-veloce-evento";

const load = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const store = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

type Props = { viewerName: string; ai: boolean; transcribe: boolean; companies: Option[]; events: EventOption[] };

const noSubscribe = () => () => {};

/** Solo nel browser: la bozza sta nel telefono, il server non la conosce. */
export function QuickCapture(props: Props) {
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  return inBrowser ? <Capture {...props} /> : <div className="m-4 h-96 animate-pulse rounded-xl bg-muted" />;
}

function Capture({ viewerName, ai, transcribe, companies, events }: Props) {
  // Bozza ed evento ricordati dal telefono
  const [d, setD] = useState<Draft>(() => ({ ...EMPTY, ...load<Draft>(DRAFT_KEY) }));
  const [eventChoice, setEventChoice] = useState<string>(() => {
    const ev = load<{ choice: string }>(EVENT_KEY);
    return ev && (ev.choice === "nuovo" || events.some((e) => e.id === ev.choice)) ? ev.choice : "";
  }); // id, "nuovo" o ""
  const [newEvent, setNewEvent] = useState(() => load<{ name: string }>(EVENT_KEY)?.name ?? "");
  const [shots, setShots] = useState<Shot[]>([]);
  const [saved, setSaved] = useState<(QuickSaved & { who: string }) | null>(null);
  const [scanning, startScan] = useTransition();
  const [recapping, startRecap] = useTransition();
  const [saving, startSave] = useTransition();

  useEffect(() => {
    store(DRAFT_KEY, JSON.stringify(d) === JSON.stringify(EMPTY) ? null : d);
  }, [d]);
  useEffect(() => {
    store(EVENT_KEY, { choice: eventChoice, name: newEvent });
  }, [eventChoice, newEvent]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));

  const match = useMemo(() => {
    const n = d.companyName.trim().toLowerCase();
    return n ? (companies.find((c) => c.name.toLowerCase() === n) ?? null) : null;
  }, [companies, d.companyName]);

  const eventName = eventChoice === "nuovo" ? newEvent.trim() : (events.find((e) => e.id === eventChoice)?.name ?? "");
  const who = `${d.firstName} ${d.lastName}`.trim();

  const scan = (images: Shot[]) =>
    startScan(async () => {
      const res = await scanBusinessCard(images.map(({ mediaType, data }) => ({ mediaType, data })));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const c = res.data;
      // Riempie solo i campi vuoti: quello che hai già scritto vince
      setD((prev) => ({
        ...prev,
        firstName: prev.firstName || c.firstName,
        lastName: prev.lastName || c.lastName,
        position: prev.position || c.position,
        email: prev.email || c.email,
        phone: prev.phone || c.phones.join(" · "),
        linkedin: prev.linkedin || c.linkedin,
        companyName: prev.companyName || c.companyName,
        website: prev.website || c.website,
        country: prev.country || c.country,
        other: prev.other || [c.address, c.other].filter(Boolean).join(" · "),
      }));
      toast.success("Biglietto letto: controlla i campi");
    });

  const addShot = async (file: File | undefined) => {
    if (!file) return;
    try {
      const shot = await shrink(file);
      setShots((prev) => [...prev, shot].slice(0, 2));
    } catch {
      toast.error("Foto non leggibile");
    }
  };

  const recap = (transcript = d.transcript) =>
    startRecap(async () => {
      const res = await recapNote({
        transcript,
        person: who || undefined,
        company: d.companyName || undefined,
        event: eventName || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const r = res.data;
      setD((prev) => ({
        ...prev,
        recap: r.recap,
        noteTitle: r.title,
        steps: r.nextSteps.map((s) => ({ ...s, on: true })),
        interests: r.interests,
        mode: prev.mode ?? r.temperature,
      }));
    });

  // Appena arriva una trascrizione, il recap parte da solo
  const autoRecap = useRef(false);
  useEffect(() => {
    if (!autoRecap.current || d.transcript.trim().length < 10) return;
    autoRecap.current = false;
    recap(d.transcript);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo quando cambia la trascrizione
  }, [d.transcript]);

  const save = () =>
    startSave(async () => {
      const res = await quickSave({
        companyId: match?.id ?? null,
        companyName: d.companyName,
        website: d.website,
        country: d.country,
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        phone: d.phone,
        position: d.position,
        linkedin: d.linkedin,
        eventId: eventChoice && eventChoice !== "nuovo" ? eventChoice : null,
        newEventName: eventChoice === "nuovo" ? newEvent : undefined,
        followupMode: d.mode,
        noteTitle: d.noteTitle,
        recap: [d.recap, d.other ? `Dal biglietto: ${d.other}` : ""].filter(Boolean).join("\n\n") || undefined,
        transcript: d.transcript || undefined,
        interests: d.interests,
        steps: d.steps.filter((s) => s.on).map(({ title, dueInDays }) => ({ title, dueInDays })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSaved({ ...res.data, who: who || d.companyName });
      setD(EMPTY);
      setShots([]);
      store(DRAFT_KEY, null);
      // Il nuovo evento ora esiste: la prossima volta si sceglie dalla lista
      window.scrollTo({ top: 0 });
    });

  const canSave = Boolean(match || d.companyName.trim() || d.firstName.trim());

  if (saved) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Header />
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-5 py-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-ok/15 text-ok">
            <Check className="size-6" />
          </span>
          <p className="text-lg font-semibold">{saved.who} è nel CRM</p>
          <p className="text-sm text-muted-foreground">
            {[
              saved.personCreated ? "Persona nuova" : saved.personId ? "Persona già presente, aggiornata" : null,
              saved.companyCreated ? "azienda nuova" : saved.companyId ? "azienda già presente" : null,
              saved.tasks ? `${saved.tasks} task per te` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {saved.personId ? (
              <Link href={`/people/${saved.personId}`} className={buttonVariants({ variant: "outline" })}>
                Apri la persona
              </Link>
            ) : null}
            {saved.companyId ? (
              <Link href={`/companies/${saved.companyId}`} className={buttonVariants({ variant: "outline" })}>
                Apri l&apos;azienda
              </Link>
            ) : null}
          </div>
        </div>
        <Button size="lg" className="h-14 text-base" onClick={() => setSaved(null)}>
          Nuovo contatto
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">
      <Header />

      <Block title="Dove">
        <select
          value={eventChoice}
          onChange={(e) => setEventChoice(e.target.value)}
          className="h-12 w-full rounded-lg border bg-background px-3 text-base"
          aria-label="Evento"
        >
          <option value="">Nessun evento</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.date ? `${e.name} · ${e.date.slice(0, 4)}` : e.name}
            </option>
          ))}
          <option value="nuovo">+ Nuovo evento…</option>
        </select>
        {eventChoice === "nuovo" ? (
          <Input value={newEvent} onChange={(e) => setNewEvent(e.target.value)} placeholder="Nome dell'evento" className="h-12 text-base" />
        ) : null}
      </Block>

      <Block title="Biglietto da visita" hint={ai ? "Fronte, e retro se serve: i campi si compilano da soli" : "Lettura automatica non attiva: compila a mano"}>
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((i) => {
            const shot = shots[i];
            return shot ? (
              <div key={i} className="relative aspect-[1.6] overflow-hidden rounded-lg border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot.preview} alt={i ? "Retro" : "Fronte"} className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => setShots((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"
                  aria-label="Togli la foto"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label
                key={i}
                className={cn(
                  "flex aspect-[1.6] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground",
                  i > shots.length && "pointer-events-none opacity-40",
                )}
              >
                <Camera className="size-5" />
                {i ? "Retro" : "Fronte"}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => addShot(e.target.files?.[0])} />
              </label>
            );
          })}
        </div>
        {shots.length && ai ? (
          <Button size="lg" className="h-12 text-base" disabled={scanning} onClick={() => scan(shots)}>
            {scanning ? <Loader2 className="animate-spin" /> : <ScanText />}
            {scanning ? "Leggo il biglietto…" : "Leggi il biglietto"}
          </Button>
        ) : null}
      </Block>

      <Block title="Persona">
        <div className="grid grid-cols-2 gap-2">
          <Field value={d.firstName} onChange={(v) => set("firstName", v)} placeholder="Nome" autoComplete="off" />
          <Field value={d.lastName} onChange={(v) => set("lastName", v)} placeholder="Cognome" autoComplete="off" />
        </div>
        <Field value={d.position} onChange={(v) => set("position", v)} placeholder="Ruolo" />
        <Field value={d.email} onChange={(v) => set("email", v)} placeholder="Email" type="email" inputMode="email" />
        <Field value={d.phone} onChange={(v) => set("phone", v)} placeholder="Telefono" type="tel" inputMode="tel" />
        <Field value={d.linkedin} onChange={(v) => set("linkedin", v)} placeholder="LinkedIn" inputMode="url" />
      </Block>

      <Block title="Azienda">
        <Field value={d.companyName} onChange={(v) => set("companyName", v)} placeholder="Nome dell'azienda" list="veloce-aziende" />
        <datalist id="veloce-aziende">
          {companies.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
        {match ? <p className="text-[13px] text-ok">Già nel CRM: la persona si collega a {match.name}</p> : null}
        <div className="grid grid-cols-[1fr_7.5rem] gap-2">
          <Field value={d.website} onChange={(v) => set("website", v)} placeholder="Sito" inputMode="url" />
          <Field value={d.country} onChange={(v) => set("country", v)} placeholder="Paese" />
        </div>
        {d.other ? (
          <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
            <span className="flex-1">Dal biglietto: {d.other}</span>
            <button type="button" onClick={() => set("other", "")} aria-label="Togli">
              <X className="size-4" />
            </button>
          </p>
        ) : null}
      </Block>

      <Block title="Conversazione" hint="Registra mentre parlate (avvisa chi hai davanti) o carica una nota vocale: arriva trascritta">
        <Recorder
          enabled={transcribe}
          onText={(text) => {
            autoRecap.current = ai;
            setD((prev) => ({ ...prev, transcript: prev.transcript.trim() ? `${prev.transcript.trim()}\n\n${text}` : text }));
          }}
        />
        <Textarea
          value={d.transcript}
          onChange={(e) => set("transcript", e.target.value)}
          rows={d.transcript ? 8 : 3}
          placeholder="La trascrizione arriva qui. Puoi anche scrivere i tuoi appunti."
          className="text-[15px]"
          aria-label="Trascrizione e appunti"
        />
        {ai && d.transcript.trim().length >= 10 ? (
          <Button variant="outline" size="lg" className="h-12 text-base" disabled={recapping} onClick={() => recap()}>
            {recapping ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {recapping ? "Faccio il recap…" : d.recap ? "Rifai il recap" : "Fai il recap"}
          </Button>
        ) : null}
        {d.recap ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
            <Input value={d.noteTitle} onChange={(e) => set("noteTitle", e.target.value)} className="h-10 font-medium" aria-label="Titolo della nota" />
            <Textarea value={d.recap} onChange={(e) => set("recap", e.target.value)} rows={5} className="text-[15px]" aria-label="Recap" />
            {d.interests.length ? <p className="text-[13px] text-muted-foreground">Interessi: {d.interests.join(", ")}</p> : null}
            {d.steps.length ? (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Prossimi passi: quelli spuntati diventano task tuoi</p>
                {d.steps.map((s, i) => (
                  <label key={i} className="flex items-start gap-2.5 py-1 text-[15px]">
                    <input
                      type="checkbox"
                      checked={s.on}
                      onChange={(e) => set("steps", d.steps.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
                      className="mt-1 size-4 accent-[var(--brand)]"
                    />
                    <span className="flex-1">
                      {s.title}
                      {s.dueInDays ? <span className="text-muted-foreground"> · entro {s.dueInDays} gg</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Block>

      <Block title="Follow-up">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ["caldo", "Caldo"],
              ["freddo", "Freddo"],
              ["nessuno", "Nessuno"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => set("mode", d.mode === value ? null : value)}
              className={cn("h-10 rounded-md text-sm font-medium", d.mode === value ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      </Block>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2">
          <Button
            variant="ghost"
            size="lg"
            className="h-14"
            aria-label="Svuota"
            disabled={saving}
            onClick={() => {
              if (window.confirm("Svuoto la scheda? Quello che hai scritto si perde.")) {
                setD(EMPTY);
                setShots([]);
              }
            }}
          >
            <RotateCcw />
          </Button>
          <Button size="lg" className="h-14 flex-1 text-base" disabled={!canSave || saving || scanning || recapping} onClick={save}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
            {saving ? "Salvo…" : `Salva${who ? ` ${d.firstName}` : d.companyName ? ` ${d.companyName}` : ""}`}
          </Button>
        </div>
        <p className="mx-auto mt-1.5 max-w-md text-center text-[11px] text-muted-foreground">Ciao {viewerName} · la bozza resta sul telefono finché non salvi</p>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[19px] tracking-[-0.02em]">
        <span className="font-normal">soma</span>
        <span className="font-bold italic">space</span>.
        <span className="ml-2 align-middle text-xs font-medium tracking-normal text-muted-foreground">Nuovo contatto</span>
      </p>
      <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Apri il CRM
      </Link>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ onChange, ...props }: Omit<React.ComponentProps<"input">, "onChange"> & { onChange: (v: string) => void }) {
  return <Input {...props} onChange={(e) => onChange(e.target.value)} className="h-12 text-base" aria-label={props.placeholder} />;
}

/** Foto → JPEG di 1600 px al massimo: abbastanza per leggere, leggera da mandare. */
async function shrink(file: File): Promise<Shot> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { mediaType: "image/jpeg", data: url.slice(url.indexOf(",") + 1), preview: url };
}

// --- Nota vocale -----------------------------------------------------------

type Phase = "idle" | "recording" | "working";

const pickMime = () => {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
};

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/** Manda l'audio a ElevenLabs (direttamente dal telefono, con un gettone monouso) e torna la trascrizione. */
async function transcribeBlob(blob: Blob, onStep: (s: string) => void): Promise<string> {
  const start = await startTranscription();
  if (!start.ok) throw new Error(start.error);
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("diarize", "true");
  form.append("tag_audio_events", "false");
  form.append("file", blob, blob instanceof File ? blob.name : `nota.${blob.type.includes("webm") ? "webm" : blob.type.includes("ogg") ? "ogg" : "m4a"}`);
  onStep(blob.size > 20_000_000 ? "Carico e trascrivo (è lunga, qualche minuto)…" : "Carico e trascrivo…");
  const res = await fetch(`https://api.elevenlabs.io/v1/speech-to-text?token=${encodeURIComponent(start.data.token)}`, { method: "POST", body: form }).catch(() => null);
  if (!res) throw new Error("Caricamento non riuscito: controlla la rete e riprova");
  const json = (await res.json().catch(() => ({}))) as ScribeResponse & { detail?: unknown };
  if (!res.ok) throw new Error(`Trascrizione non riuscita (${res.status})`);
  const text = speakerTurns(json);
  if (!text) throw new Error("Nell'audio non si sente nessuno che parla");
  return text;
}

/**
 * Registra la conversazione col microfono del telefono, oppure prende una nota vocale già registrata
 * (Memo vocali su iPhone: Condividi → Salva su File; su Android il registratore). Poi la trascrive ElevenLabs, con chi dice cosa.
 * Se qualcosa va storto l'audio resta qui: si può riprovare o salvarlo sul telefono, non si perde.
 */
function Recorder({ enabled, onText }: { enabled: boolean; onText: (text: string) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState<Blob[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const recording = useRef(false);

  useEffect(
    () => () => {
      recording.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  // Un pezzo alla volta, in ordine: la trascrizione arriva nella sequenza giusta
  const process = (blob: Blob) => {
    pending.current++;
    if (!recording.current) setPhase("working");
    queue.current = queue.current.then(async () => {
      setStatus("Preparo…");
      try {
        onText(await transcribeBlob(blob, setStatus));
      } catch (e) {
        setFailed((f) => [...f, blob]);
        toast.error(e instanceof Error ? e.message : "Trascrizione non riuscita");
      } finally {
        pending.current--;
        if (pending.current === 0) {
          setStatus("");
          setPhase(recording.current ? "recording" : "idle");
        }
      }
    });
  };

  const startSegment = (mime: string) => {
    const r = new MediaRecorder(stream.current!, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = () => {
      const blob = new Blob(chunks, { type: r.mimeType || mime || "audio/mp4" });
      if (blob.size > 2000) process(blob);
      else if (!recording.current && !pending.current) setPhase("idle");
    };
    r.start(1000);
    recorder.current = r;
  };

  const begin = async () => {
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Questo browser non registra: usa Carica");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      toast.error("Il microfono è bloccato: consenti l'accesso nelle impostazioni del browser");
      return;
    }
    recording.current = true;
    setSeconds(0);
    setPhase("recording");
    startSegment(mime);
    const t0 = Date.now();
    timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - t0) / 1000)), 1000);
    // Schermo acceso mentre registri: col telefono bloccato il browser smette di registrare
    const nav = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (wake.current = l))
      .catch(() => {});
  };

  const end = () => {
    recording.current = false;
    if (timer.current) clearInterval(timer.current);
    setPhase("working");
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    void wake.current?.release().catch(() => {});
    wake.current = null;
  };

  const upload = (file: File | undefined) => {
    if (file) process(file);
  };

  const retry = () => {
    const list = failed;
    setFailed([]);
    for (const blob of list) process(blob);
  };

  const download = () =>
    failed.forEach((blob, i) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `nota-vocale-${i + 1}.${blob.type.includes("webm") ? "webm" : blob.type.includes("ogg") ? "ogg" : "m4a"}`;
      a.click();
    });

  if (!enabled) {
    return (
      <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
        Trascrizione non attiva (manca la chiave di ElevenLabs): scrivi gli appunti qui sotto, anche col microfono della tastiera.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          size="lg"
          variant={phase === "recording" ? "destructive" : "default"}
          className="h-14 flex-1 text-base"
          disabled={phase === "working"}
          onClick={phase === "recording" ? end : begin}
        >
          {phase === "recording" ? <Square /> : <Mic />}
          {phase === "recording" ? `Ferma · ${fmt(seconds)}` : "Registra"}
        </Button>
        <label className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-14 cursor-pointer px-4 text-base", phase !== "idle" && "pointer-events-none opacity-50")}>
          <Upload />
          Carica
          <input
            type="file"
            accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.opus,.webm"
            className="sr-only"
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {phase === "recording" ? (
        <p className="flex items-center gap-2 text-[13px] text-bad">
          <span className="size-2 animate-pulse rounded-full bg-bad" /> Sto registrando: tieni lo schermo acceso
        </p>
      ) : null}
      {status ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> {status}
        </p>
      ) : null}
      {failed.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-[13px]">
          <span className="flex-1">{failed.length === 1 ? "Un audio non trascritto" : `${failed.length} audio non trascritti`}: è ancora qui.</span>
          <Button size="sm" variant="outline" onClick={retry} disabled={phase !== "idle"}>
            Riprova
          </Button>
          <Button size="sm" variant="ghost" onClick={download}>
            <Download /> Salva
          </Button>
        </div>
      ) : null}
    </div>
  );
}
