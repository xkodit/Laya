"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/auth/submit-button";
import { uploadDocumentAction, type ActionState } from "@/app/admin/documents/actions";
import { SOURCE_TYPE_OPTIONS } from "./source-type-options";

export function UploadDocumentDialog() {
  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState<string>("");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ActionState, FormData>(
    uploadDocumentAction,
    undefined,
  );

  useEffect(() => {
    if (state?.success) {
      setOpen(false);
      setSourceType("");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Téléverser un document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Téléverser un document</DialogTitle>
          <DialogDescription>
            Le fichier est stocké dans le bucket <code>corpus</code>. L&apos;ingestion
            (parsing + embeddings) tournera au prochain
            {" "}
            <code>python scripts/ingest.py --from-pending</code>.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4" noValidate>
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="file">Fichier PDF</Label>
            <Input
              id="file"
              name="file"
              type="file"
              accept="application/pdf,.pdf,.docx"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Titre</Label>
            <Input
              id="title"
              name="title"
              placeholder="Code du Travail — Loi n° 2015-532"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="reference">Référence</Label>
              <Input
                id="reference"
                name="reference"
                placeholder="Loi n° 2015-532"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="effective_date">Entrée en vigueur</Label>
              <Input
                id="effective_date"
                name="effective_date"
                type="date"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source_type">Type de source</Label>
            <Select
              value={sourceType}
              onValueChange={setSourceType}
              name="source_type"
              required
            >
              <SelectTrigger id="source_type" className="w-full">
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
            <div className="space-y-0.5">
              <Label htmlFor="is_primary_source" className="text-sm font-medium">
                Source primaire (citable)
              </Label>
              <p className="text-xs text-muted-foreground">
                Seules les sources primaires (lois, décrets, arrêtés) peuvent
                être citées via l&apos;API Citations.
              </p>
            </div>
            <Switch id="is_primary_source" name="is_primary_source" />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Annuler
            </Button>
            <SubmitButton pendingLabel="Upload en cours…" className="">
              Téléverser
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
