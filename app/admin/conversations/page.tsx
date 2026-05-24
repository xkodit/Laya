import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default async function ConversationsPage() {
  const service = createServiceClient();

  const { data, error } = await service
    .from("conversations")
    .select(
      "id, title, language, is_favorite, created_at, updated_at, user_id, profiles!conversations_user_id_fkey(full_name, email), messages(count)",
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  // PostgREST returns profiles as a single object (many-to-one onto unique PK).
  // messages(count) is an aggregate and comes back as an array of one row.
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    title: string | null;
    language: string;
    is_favorite: boolean;
    created_at: string;
    updated_at: string;
    user_id: string;
    profiles: { full_name: string; email: string } | null;
    messages: { count: number }[];
  }>;

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} conversation{rows.length === 1 ? "" : "s"} (200 plus récentes).
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
              <TableHead>Titre</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Langue</TableHead>
              <TableHead className="text-right">Messages</TableHead>
              <TableHead>Dernière activité</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Aucune conversation pour l&apos;instant.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => {
                const msgCount = c.messages?.[0]?.count ?? 0;
                const owner = c.profiles ?? null;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-xs">
                      <Link
                        href={`/admin/conversations/${c.id}`}
                        className="truncate font-medium hover:underline"
                      >
                        {c.title ?? "Sans titre"}
                        {c.is_favorite ? (
                          <span className="ml-2 text-amber-500">★</span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {owner ? (
                        <Link
                          href={`/admin/users/${c.user_id}`}
                          className="hover:underline"
                        >
                          {owner.full_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {c.language}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {msgCount.toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(c.updated_at)}
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
