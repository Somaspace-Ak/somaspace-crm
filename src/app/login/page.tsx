import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/crm/login-form";
import { authEnabled, googleEnabled } from "@/lib/supabase/config";
import { safeNext } from "@/server/session";

export const metadata = { title: "Accedi" };

const ERRORS: Record<string, string> = {
  "non-autorizzato": "Questo account non è tra gli utenti del CRM. Chiedi a un fondatore di aggiungerti.",
  google: "Accesso con Google non riuscito. Riprova.",
};

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <p className="text-center text-[22px] tracking-[-0.02em]">
          <span className="font-normal">soma</span>
          <span className="font-bold italic">space</span>.
          <span className="ml-2 align-middle text-xs font-medium tracking-normal text-muted-foreground">CRM</span>
        </p>
        <Suspense fallback={<div className="h-72 rounded-xl border bg-card" />}>
          <Login {...props} />
        </Suspense>
      </div>
    </main>
  );
}

async function Login({ searchParams }: PageProps<"/login">) {
  // In locale senza Supabase non c'è login: si entra direttamente
  if (!authEnabled) redirect("/");
  const { da, errore } = await searchParams;
  return (
    <LoginForm
      next={safeNext(typeof da === "string" ? da : undefined)}
      google={googleEnabled}
      error={typeof errore === "string" ? (ERRORS[errore] ?? null) : null}
      signedInButNotAllowed={errore === "non-autorizzato"}
    />
  );
}
