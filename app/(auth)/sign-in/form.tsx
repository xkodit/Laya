"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInAction, type SignInState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/auth/submit-button";

export function SignInForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<SignInState, FormData>(
    signInAction,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />

      {state?.error ? (
        <Alert variant="destructive" role="alert" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password">Mot de passe</Label>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
        />
      </div>

      <SubmitButton pendingLabel="Connexion en cours…">Se connecter</SubmitButton>

      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Demander l&apos;accès
        </Link>
      </p>
    </form>
  );
}
