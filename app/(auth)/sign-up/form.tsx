"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type SignUpState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { USER_TYPES } from "@/lib/auth/user-types";

export function SignUpForm() {
  const [state, formAction] = useActionState<SignUpState, FormData>(
    signUpAction,
    undefined,
  );

  if (state && "success" in state) {
    return (
      <Alert role="status" aria-live="polite">
        <AlertTitle>Vérifie ta boîte mail</AlertTitle>
        <AlertDescription>
          Nous avons envoyé un lien de confirmation à{" "}
          <strong>{state.email}</strong>. Clique sur ce lien pour activer ton
          compte.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state && "error" in state ? (
        <Alert variant="destructive" role="alert" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="full_name">Nom complet</Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-describedby="password-help"
        />
        <p id="password-help" className="text-xs text-muted-foreground">
          8 caractères minimum.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="user_type">Tu es…</Label>
        <select
          id="user_type"
          name="user_type"
          required
          defaultValue=""
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="" disabled>
            Choisis ton profil
          </option>
          {USER_TYPES.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="company">
          Entreprise{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (optionnel)
          </span>
        </Label>
        <Input
          id="company"
          name="company"
          type="text"
          autoComplete="organization"
        />
      </div>

      <SubmitButton pendingLabel="Création du compte…">
        Créer mon compte
      </SubmitButton>

      <p className="text-center text-sm text-muted-foreground">
        Déjà un compte ?{" "}
        <Link
          href="/sign-in"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Se connecter
        </Link>
      </p>
    </form>
  );
}
