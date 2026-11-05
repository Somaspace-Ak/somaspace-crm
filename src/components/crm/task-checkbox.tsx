"use client";

import { useOptimistic, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { toggleTask } from "@/server/actions";

/** Spunta un task: lo schermo cambia subito, il salvataggio avviene in background. */
export function TaskCheckbox({ id, done, label }: { id: string; done: boolean; label: string }) {
  const [, start] = useTransition();
  const [checked, setChecked] = useOptimistic(done);
  return (
    <Checkbox
      checked={checked}
      aria-label={checked ? `Riapri: ${label}` : `Completa: ${label}`}
      onCheckedChange={(value) =>
        start(async () => {
          setChecked(value === true);
          await toggleTask(id, value === true);
        })
      }
    />
  );
}
