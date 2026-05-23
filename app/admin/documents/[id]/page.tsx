import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DocumentRowActions } from "@/components/admin/documents/row-actions";
import { sourceTypeLabel } from "@/components/admin/documents/source-type-options";

export const dynamic = "force-dynamic";

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
    month: "long",
    day: "numeric",
  });
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select(
      "id, title, reference, source_type, is_primary_source, source_authority, status, effective_date, storage_path, created_at",
    )
    .eq("id", id)
    .single();

  if (!doc) {
    notFound();
  }

  const { data: chunks } = await supabase
    .from("document_chunks")
    .select("id, article_ref, parent_section, chunk_index, content")
    .eq("document_id", id)
    .order("chunk_index", { ascending: true })
    .limit(50);

  const { count: totalChunks } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", id);

  const { data: signed } = await supabase.storage
    .from("corpus")
    .createSignedUrl(doc.storage_path, 60 * 10);

  const statusInfo = STATUS_LABEL[doc.status] ?? {
    label: doc.status,
    variant: "outline" as const,
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/admin/documents"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Documents
        </Link>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{doc.reference ?? "—"}</span>
            <span>·</span>
            <span>{sourceTypeLabel(doc.source_type)}</span>
            <span>·</span>
            {doc.is_primary_source ? (
              <Badge variant="secondary">source primaire</Badge>
            ) : (
              <span>source secondaire</span>
            )}
            <span>·</span>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {signed?.signedUrl ? (
            <Button asChild variant="outline">
              <a
                href={signed.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download />
                Télécharger l&apos;original
              </a>
            </Button>
          ) : null}
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
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-background p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            Entrée en vigueur
          </dt>
          <dd className="mt-1">{formatDate(doc.effective_date)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            Ajouté le
          </dt>
          <dd className="mt-1">{formatDate(doc.created_at)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            Chunks
          </dt>
          <dd className="mt-1 tabular-nums">
            {(totalChunks ?? 0).toLocaleString("fr-FR")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            Chemin storage
          </dt>
          <dd className="mt-1 truncate font-mono text-xs">
            {doc.storage_path}
          </dd>
        </div>
      </dl>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Chunks parsés
          </h2>
          <p className="text-xs text-muted-foreground">
            {chunks?.length ?? 0} chunks affichés sur {(totalChunks ?? 0).toLocaleString("fr-FR")}
          </p>
        </div>

        {chunks && chunks.length > 0 ? (
          <ul className="space-y-2">
            {chunks.map((chunk) => (
              <li
                key={chunk.id}
                className="rounded-lg border border-border bg-background p-4"
              >
                <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-mono font-medium">
                    #{chunk.chunk_index} · {chunk.article_ref ?? "—"}
                  </span>
                  {chunk.parent_section ? (
                    <span className="truncate">{chunk.parent_section}</span>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {chunk.content}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {doc.status === "pending"
              ? "En attente de traitement par le script d'ingestion."
              : doc.status === "processing"
                ? "Traitement en cours…"
                : doc.status === "failed"
                  ? "L'ingestion a échoué. Voir les logs du script."
                  : "Aucun chunk."}
          </div>
        )}
      </section>
    </div>
  );
}
