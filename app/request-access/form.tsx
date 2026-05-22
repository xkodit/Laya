"use client";

import { useActionState } from "react";
import { requestAccessAction, type RequestAccessState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { USER_TYPES } from "@/lib/auth/user-types";

export function RequestAccessForm({ initialEmail }: { initialEmail: string }) {
  const [state, formAction] = useActionState<RequestAccessState, FormData>(
    requestAccessAction,
    undefined,
  );

  if (state && "success" in state) {
    return (
      <Alert role="status" aria-live="polite">
        <AlertTitle>Demande enregistrée</AlertTitle>
        <AlertDescription>
          Merci. Nous reviendrons vers toi dès qu&apos;une place se libère dans
          la bêta.
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
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={initialEmail}
          autoFocus={!initialEmail}
        />
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

      <div className="space-y-2">
        <Label htmlFor="reason">
          Pourquoi veux-tu accéder à Laya ?{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (optionnel)
          </span>
        </Label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          maxLength={500}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <SubmitButton pendingLabel="Envoi en cours…">Envoyer ma demande</SubmitButton>
    </form>
  );
}
