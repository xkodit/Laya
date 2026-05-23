"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/auth/submit-button";
import { editDocumentAction, type ActionState } from "@/app/admin/documents/actions";
import { SOURCE_TYPE_OPTIONS } from "./source-type-options";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: {
    id: string;
    title: string;
    reference: string | null;
    source_type: string | null;
    is_primary_source: boolean;
    effective_date: string | null;
  };
};

export function EditDocumentDialog({ open, onOpenChange, doc }: Props) {
  const [sourceType, setSourceType] = useState<string>(doc.source_type ?? "");
  const [state, formAction] = useActionState<ActionState, FormData>(
    editDocumentAction,
    undefined,
  );

  useEffect(() => {
    if (open) setSourceType(doc.source_type ?? "");
  }, [open, doc.source_type]);

  useEffect(() => {
    if (state?.success) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier les métadonnées</DialogTitle>
          <DialogDescription>
            Ne déclenche pas de ré-ingestion — pour relancer le parsing,
            utiliser « Réinitialiser ».
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="document_id" value={doc.id} />

          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={`edit-title-${doc.id}`}>Titre</Label>
            <Input
              id={`edit-title-${doc.id}`}
              name="title"
              defaultValue={doc.title}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`edit-reference-${doc.id}`}>Référence</Label>
              <Input
                id={`edit-reference-${doc.id}`}
                name="reference"
                defaultValue={doc.reference ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-date-${doc.id}`}>Entrée en vigueur</Label>
              <Input
                id={`edit-date-${doc.id}`}
                name="effective_date"
                type="date"
                defaultValue={doc.effective_date ?? ""}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`edit-type-${doc.id}`}>Type de source</Label>
            <Select
              value={sourceType}
              onValueChange={setSourceType}
              name="source_type"
              required
            >
              <SelectTrigger
                id={`edit-type-${doc.id}`}
                className="w-full"
              >
                <SelectValue placeholder="Sélectionner…" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label
              htmlFor={`edit-primary-${doc.id}`}
              className="text-sm font-medium"
            >
              Source primaire (citable)
            </Label>
            <Switch
              id={`edit-primary-${doc.id}`}
              name="is_primary_source"
              defaultChecked={doc.is_primary_source}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <SubmitButton pendingLabel="Enregistrement…" className="">
              Enregistrer
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
