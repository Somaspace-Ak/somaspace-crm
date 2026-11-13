"use client";

import { ExternalLink } from "lucide-react";

/** Apre la conversazione in Gmail in una finestra piccola, accanto al CRM: per controllare che ci sia tutto. */
export function ThreadLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        const w = window.open(href, "gmail-thread", "popup,width=900,height=760");
        if (w) e.preventDefault();
      }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <ExternalLink className="size-3" aria-hidden />
      Apri la conversazione
    </a>
  );
}
