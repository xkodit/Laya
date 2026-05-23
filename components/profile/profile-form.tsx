"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/auth/submit-button";
import { USER_TYPES } from "@/lib/auth/user-types";
import {
  updateProfileAction,
  type ActionState,
} from "@/app/profile/actions";

type Props = {
  defaults: {
    full_name: string;
    user_type: string;
    company: string;
    preferred_language: string;
  };
};

export function ProfileForm({ defaults }: Props) {
  const [userType, setUserType] = useState(defaults.user_type);
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateProfileAction,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.success ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>Profil mis à jour.</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="full_name">Nom complet</Label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={defaults.full_name}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="user_type">Vous êtes</Label>
        <Select
          value={userType}
          onValueChange={setUserType}
          name="user_type"
          required
        >
          <SelectTrigger id="user_type" className="w-full">
            <SelectValue placeholder="Sélectionner…" />
          </SelectTrigger>
          <SelectContent>
            {USER_TYPES.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Calibre le ton et la profondeur des réponses.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="company">Entreprise (optionnel)</Label>
        <Input
          id="company"
          name="company"
          defaultValue={defaults.company}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="preferred_language">Langue préférée</Label>
        <Select value="fr" disabled>
          <SelectTrigger id="preferred_language" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">Français</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Anglais arrive en v1.2, arabe en v1.3+.
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <SubmitButton pendingLabel="Enregistrement…" className="">
          Enregistrer
        </SubmitButton>
      </div>
    </form>
  );
}
