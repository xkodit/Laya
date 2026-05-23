"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const SOURCE_TYPES = [
  "loi",
  "decret",
  "convention",
  "arrete",
  "handbook",
  "doctrine",
] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

function isSourceType(v: string): v is SourceType {
  return (SOURCE_TYPES as readonly string[]).includes(v);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type ActionState = { error?: string; success?: boolean } | undefined;

export async function uploadDocumentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const sourceType = String(formData.get("source_type") ?? "");
  const isPrimary = formData.get("is_primary_source") === "on";
  const effectiveDate = String(formData.get("effective_date") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Fichier requis." };
  }
  if (!title) return { error: "Titre requis." };
  if (!reference) return { error: "Référence requise." };
  if (!isSourceType(sourceType)) return { error: "Type de source invalide." };
  if (!effectiveDate) return { error: "Date d'entrée en vigueur requise." };

  const slug = slugify(reference) || `doc-${Date.now()}`;
  const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase();
  const storagePath = `${slug}/${slug}.${ext}`;

  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage
    .from("corpus")
    .upload(storagePath, file, {
      upsert: true,
      contentType: file.type || "application/pdf",
    });
  if (uploadError) {
    return { error: `Échec de l'upload : ${uploadError.message}` };
  }

  const { error: insertError } = await supabase.from("documents").insert({
    title,
    reference,
    source_type: sourceType,
    source_authority: isPrimary ? "primary" : "secondary",
    is_primary_source: isPrimary,
    effective_date: effectiveDate,
    storage_path: storagePath,
    status: "pending",
  });
  if (insertError) {
    // Roll back the storage object so we don't leave orphans.
    await supabase.storage.from("corpus").remove([storagePath]);
    return { error: `Erreur base de données : ${insertError.message}` };
  }

  revalidatePath("/admin/documents");
  return { success: true };
}

export async function deleteDocumentAction(
  documentId: string,
  storagePath: string,
): Promise<ActionState> {
  const supabase = await createClient();
  if (storagePath) {
    await supabase.storage.from("corpus").remove([storagePath]);
  }
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);
  if (error) return { error: `Suppression échouée : ${error.message}` };

  revalidatePath("/admin/documents");
  return { success: true };
}

export async function reprocessDocumentAction(
  documentId: string,
): Promise<ActionState> {
  const supabase = await createClient();
  // Wipe existing chunks and flip status back to pending — the local script
  // (`python scripts/ingest.py --from-pending`) will pick it up next run.
  await supabase
    .from("document_chunks")
    .delete()
    .eq("document_id", documentId);

  const { error } = await supabase
    .from("documents")
    .update({ status: "pending" })
    .eq("id", documentId);
  if (error) return { error: `Réinitialisation échouée : ${error.message}` };

  revalidatePath("/admin/documents");
  revalidatePath(`/admin/documents/${documentId}`);
  return { success: true };
}

export async function editDocumentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const documentId = String(formData.get("document_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const sourceType = String(formData.get("source_type") ?? "");
  const isPrimary = formData.get("is_primary_source") === "on";
  const effectiveDate = String(formData.get("effective_date") ?? "").trim();

  if (!documentId) return { error: "Document introuvable." };
  if (!title) return { error: "Titre requis." };
  if (!reference) return { error: "Référence requise." };
  if (!isSourceType(sourceType)) return { error: "Type de source invalide." };
  if (!effectiveDate) return { error: "Date d'entrée en vigueur requise." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({
      title,
      reference,
      source_type: sourceType,
      source_authority: isPrimary ? "primary" : "secondary",
      is_primary_source: isPrimary,
      effective_date: effectiveDate,
    })
    .eq("id", documentId);
  if (error) return { error: `Mise à jour échouée : ${error.message}` };

  revalidatePath("/admin/documents");
  revalidatePath(`/admin/documents/${documentId}`);
  return { success: true };
}

export async function downloadUrlAction(
  storagePath: string,
): Promise<{ url?: string; error?: string }> {
  if (!storagePath) return { error: "Chemin manquant." };
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("corpus")
    .createSignedUrl(storagePath, 60 * 5);
  if (error || !data) return { error: error?.message ?? "URL indisponible." };
  return { url: data.signedUrl };
}
