"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithGoogle, signInWithPassword, signOut } from "@/server/auth";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

export function LoginForm({
  next,
  google,
  error,
  signedInButNotAllowed,
}: {
  next: string;
  google: boolean;
  error: string | null;
  signedInButNotAllowed: boolean;
}) {
  const [state, action, pending] = useActionState(signInWithPassword, null);
  const message = state?.error ?? error;

  return (
    <div className="flex flex-col gap-5 rounded-xl border bg-card p-6 shadow-xs">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Accedi</h1>
        <p className="text-[13px] text-muted-foreground">Solo per il team Somaspace.</p>
      </div>

      {message ? (
        <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-[13px] text-bad">
          {message}
        </p>
      ) : null}

      {signedInButNotAllowed ? (
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Esci e usa un altro account
          </Button>
        </form>
      ) : null}

      {google ? (
        <>
          <form action={signInWithGoogle}>
            <input type="hidden" name="da" value={next} />
            <Button type="submit" variant="outline" className="w-full">
              <GoogleMark />
              Entra con Google
            </Button>
          </form>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            oppure
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="da" value={next} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="nome@somaspaceagency.com" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? "Entro…" : "Entra"}
        </Button>
      </form>
    </div>
  );
}
