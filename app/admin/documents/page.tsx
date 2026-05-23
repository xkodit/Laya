import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UploadDocumentDialog } from "@/components/admin/documents/upload-dialog";
import { DocumentRowActions } from "@/components/admin/documents/row-actions";
import { sourceTypeLabel } from "@/components/admin/documents/source-type-options";

export const dynamic = "force-dynamic";

type DocRow = {
  id: string;
  title: string;
  reference: string | null;
  source_type: string | null;
  is_primary_source: boolean;
  status: string;
  effective_date: string | null;
  storage_path: string;
  created_at: string;
  document_chunks: { count: number }[];
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "En attente", variant: "outline" },
  processing: { label: "En cours", variant: "secondary" },
  ready: { label: "Prêt", variant: "default" },
  failed: { label: "Échec", variant: "destructive" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, title, reference, source_type, is_primary_source, status, effective_date, storage_path, created_at, document_chunks(count)",
    )
    .order("created_at", { ascending: false });

  const docs = (data ?? []) as DocRow[];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            {docs.length} document{docs.length === 1 ? "" : "s"} dans le corpus.
          </p>
        </div>
        <UploadDocumentDialog />
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Erreur de chargement : {error.message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Titre</TableHead>
              <TableHead>Référence</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Primaire</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Chunks</TableHead>
              <TableHead>Ajouté le</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Aucun document. Téléverse-en un pour commencer.
                </TableCell>
              </TableRow>
            ) : (
              docs.map((doc) => {
                const statusInfo = STATUS_LABEL[doc.status] ?? {
                  label: doc.status,
                  variant: "outline" as const,
                };
                const chunkCount = doc.document_chunks?.[0]?.count ?? 0;
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="max-w-xs">
                      <div className="truncate font-medium">{doc.title}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {doc.reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {sourceTypeLabel(doc.source_type)}
                    </TableCell>
                    <TableCell>
                      {doc.is_primary_source ? (
                        <Badge variant="secondary">primaire</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          secondaire
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusInfo.variant}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {chunkCount.toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(doc.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DocumentRowActions
                        doc={{
                          id: doc.id,
                          title: doc.title,
                          reference: doc.reference,
                          source_type: doc.source_type,
                          is_primary_source: doc.is_primary_source,
                          effective_date: doc.effective_date,
                          storage_path: doc.storage_path,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
