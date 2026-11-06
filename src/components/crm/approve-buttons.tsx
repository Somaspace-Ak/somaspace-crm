"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approvePeople, discardPeople } from "@/server/mutations";

/** Approva o scarta un contatto proposto dall'agente, ovunque compaia. */
export function ApproveButtons({ id, size = "sm" }: { id: string; size?: "sm" | "xs" }) {
  const [pending, start] = useTransition();
  const run = (fn: typeof approvePeople, done: string) =>
    start(async () => {
      const res = await fn([id]);
      if (res.ok) toast.success(done);
      else toast.error(res.error);
    });
  return (
    <span className="flex shrink-0 gap-1">
      <Button size={size} disabled={pending} onClick={() => run(approvePeople, "Contatto approvato: ora è nel CRM")}>
        <Check aria-hidden />
        Approva
      </Button>
      <Button size={size} variant="ghost" disabled={pending} onClick={() => run(discardPeople, "Scartato: non verrà più proposto")}>
        <X aria-hidden />
        Scarta
      </Button>
    </span>
  );
}
