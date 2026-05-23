import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { ConversationViewer } from "@/components/admin/conversation-viewer";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = createServiceClient();

  const { data: conversation } = await service
    .from("conversations")
    .select(
      "id, title, language, is_favorite, summary, created_at, updated_at, user_id, profiles!conversations_user_id_fkey(full_name, email)",
    )
    .eq("id", id)
    .single();

  if (!conversation) {
    notFound();
  }

  const { data: messages } = await service
    .from("messages")
    .select("id, role, content, citations, tool_calls, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const owner = (conversation.profiles as unknown) as
    | { full_name: string; email: string }
    | null;

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/admin/conversations"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Conversations
        </Link>
      </div>

      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {conversation.title ?? "Sans titre"}
          {conversation.is_favorite ? (
            <span className="ml-2 text-amber-500">★</span>
          ) : null}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {owner ? (
            <Link
              href={`/admin/users/${conversation.user_id}`}
              className="hover:underline"
            >
              {owner.full_name} ({owner.email})
            </Link>
          ) : (
            <span>—</span>
          )}
          <span>·</span>
          <span>{conversation.language}</span>
          <span>·</span>
          <span>Créée le {formatDate(conversation.created_at)}</span>
          <span>·</span>
          <span>Mise à jour {formatDate(conversation.updated_at)}</span>
        </div>
      </header>

      {conversation.summary ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
            Résumé compacté
          </h3>
          <p className="mt-2 text-sm leading-relaxed">
            {conversation.summary}
          </p>
        </div>
      ) : null}

      <ConversationViewer
        messages={
          (messages ?? []).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            citations: (m.citations as unknown) as
              | Array<{
                  document_id?: string;
                  document_title?: string;
                  cited_text?: string;
                  start_char?: number;
                  end_char?: number;
                }>
              | null,
            tool_calls: m.tool_calls,
            created_at: m.created_at,
          }))
        }
      />
    </div>
  );
}
