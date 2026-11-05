"use client";

import { useEffect, useSyncExternalStore } from "react";

/** Liste per i menu di scelta (aziende, persone, utenti, progetti), condivise da tutte le schermate. */
export type FormOptions = {
  users: { id: string; name: string; initials: string }[];
  companies: { id: string; name: string }[];
  people: { id: string; name: string; companyId: string | null }[];
  projects: { id: string; name: string }[];
};

const EMPTY: FormOptions = { users: [], companies: [], people: [], projects: [] };
let current = EMPTY;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useFormOptions() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => EMPTY,
  );
}

/** Montato nel layout: tiene aggiornate le liste a ogni navigazione. */
export function FormOptionsBridge({ options }: { options: FormOptions }) {
  useEffect(() => {
    current = options;
    listeners.forEach((l) => l());
  }, [options]);
  return null;
}
