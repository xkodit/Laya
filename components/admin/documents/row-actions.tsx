"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Eye,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteDocumentAction,
  reprocessDocumentAction,
} from "@/app/admin/documents/actions";
import { EditDocumentDialog } from "./edit-dialog";

type Props = {
  doc: {
    id: string;
    title: string;
    reference: string | null;
    source_type: string | null;
    is_primary_source: boolean;
    effective_date: string | null;
    storage_path: string;
  };
};

export function DocumentRowActions({ doc }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDocumentAction(doc.id, doc.storage_path);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
    });
  }

  function runReprocess() {
    setError(null);
    startTransition(async () => {
      const result = await reprocessDocumentAction(doc.id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setReprocessOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/admin/documents/${doc.id}`}>
              <Eye />
              Voir le détail
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setReprocessOpen(true)}>
            <RefreshCw />
            Réinitialiser
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2 />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditDocumentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        doc={{
          id: doc.id,
          title: doc.title,
          reference: doc.reference,
          source_type: doc.source_type,
          is_primary_source: doc.is_primary_source,
          effective_date: doc.effective_date,
        }}
      />

      <Dialog open={reprocessOpen} onOpenChange={setReprocessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser le document ?</DialogTitle>
            <DialogDescription>
              Les chunks existants seront supprimés et le statut repassera à
              <code className="mx-1">pending</code>. Au prochain
              <code className="mx-1">python scripts/ingest.py --from-pending</code>
              le document sera re-parsé et re-embedded.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setReprocessOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button onClick={runReprocess} disabled={isPending}>
              {isPending ? "Réinitialisation…" : "Réinitialiser"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce document ?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{doc.title}</span>
              {" "}sera supprimé du corpus avec tous ses chunks et le fichier
              dans le bucket storage. Action irréversible.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={runDelete}
              disabled={isPending}
            >
              {isPending ? "Suppression…" : "Supprimer définitivement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
