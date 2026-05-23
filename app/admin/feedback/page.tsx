import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const RATING: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  up: { label: "👍 Positif", variant: "secondary" },
  down: { label: "👎 Négatif", variant: "outline" },
  report: { label: "🚩 Signalement", variant: "destructive" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function FeedbackPage() {
  const service = createServiceClient();

  const { data, error } = await service
    .from("message_feedback")
    .select(
      "id, rating, comment, created_at, user_id, message_id, profiles!message_feedback_user_id_fkey(full_name, email), messages!message_feedback_message_id_fkey(content, conversation_id)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    rating: string;
    comment: string | null;
    created_at: string;
    user_id: string;
    message_id: string;
    profiles: { full_name: string; email: string }[] | null;
    messages: { content: string; conversation_id: string }[] | null;
  }>;

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Retours</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} retour{rows.length === 1 ? "" : "s"} (200 plus récents).
          Cliquer un titre pour ouvrir la conversation au message concerné.
        </p>
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
              <TableHead>Note</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Commentaire</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Aucun retour pour l&apos;instant.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((f) => {
                const rating = RATING[f.rating] ?? {
                  label: f.rating,
                  variant: "outline" as const,
                };
                const msg = f.messages?.[0] ?? null;
                const owner = f.profiles?.[0] ?? null;
                const convoId = msg?.conversation_id;
                const preview = msg?.content?.slice(0, 140) ?? "—";
                return (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Badge variant={rating.variant}>{rating.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {owner ? (
                        <Link
                          href={`/admin/users/${f.user_id}`}
                          className="hover:underline"
                        >
                          {owner.full_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      {convoId ? (
                        <Link
                          href={`/admin/conversations/${convoId}?msg=${f.message_id}`}
                          className="block truncate text-sm hover:underline"
                          title={preview}
                        >
                          {preview}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          {preview}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {f.comment ? (
                        <span className="text-sm">{f.comment}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(f.created_at)}
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
