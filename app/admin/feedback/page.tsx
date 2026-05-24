import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

const FILTERS: { value: "all" | "up" | "down" | "report"; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "up", label: "👍 Positifs" },
  { value: "down", label: "👎 Négatifs" },
  { value: "report", label: "🚩 Signalements" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ rating?: string }>;
}) {
  const { rating: ratingParam } = await searchParams;
  const activeFilter: "all" | "up" | "down" | "report" =
    ratingParam === "up" || ratingParam === "down" || ratingParam === "report"
      ? ratingParam
      : "all";

  const service = createServiceClient();

  // Counts per rating, independent of the active filter, so the pills can show
  // the total each type has — useful at-a-glance.
  const { data: countData } = await service
    .from("message_feedback")
    .select("rating");
  const counts: Record<string, number> = { up: 0, down: 0, report: 0 };
  for (const r of countData ?? []) {
    const k = (r as { rating: string }).rating;
    if (k in counts) counts[k]++;
  }
  const totalCount = counts.up + counts.down + counts.report;

  let query = service
    .from("message_feedback")
    .select(
      "id, rating, comment, created_at, user_id, message_id, profiles!message_feedback_user_id_fkey(full_name, email), messages!message_feedback_message_id_fkey(content, conversation_id)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (activeFilter !== "all") {
    query = query.eq("rating", activeFilter);
  }

  const { data, error } = await query;

  // PostgREST returns embedded many-to-one relations as a single object (since
  // user_id/message_id are FKs onto unique PKs), not an array.
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    rating: string;
    comment: string | null;
    created_at: string;
    user_id: string;
    message_id: string;
    profiles: { full_name: string; email: string } | null;
    messages: { content: string; conversation_id: string } | null;
  }>;

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Retours</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} retour{rows.length === 1 ? "" : "s"} affiché
          {rows.length === 1 ? "" : "s"} (200 max). Cliquer un titre pour ouvrir
          la conversation au message concerné.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const count =
            f.value === "all" ? totalCount : counts[f.value] ?? 0;
          const isActive = activeFilter === f.value;
          const href = f.value === "all" ? "/admin/feedback" : `/admin/feedback?rating=${f.value}`;
          return (
            <Link
              key={f.value}
              href={href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] tabular-nums",
                  isActive
                    ? "bg-background/20 text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

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
                  {activeFilter === "all"
                    ? "Aucun retour pour l'instant."
                    : `Aucun retour de type « ${
                        FILTERS.find((f) => f.value === activeFilter)?.label
                      } » pour l'instant.`}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((f) => {
                const rating = RATING[f.rating] ?? {
                  label: f.rating,
                  variant: "outline" as const,
                };
                const msg = f.messages ?? null;
                const owner = f.profiles ?? null;
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
