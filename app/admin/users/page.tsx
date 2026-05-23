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
import { USER_TYPES } from "@/lib/auth/user-types";

export const dynamic = "force-dynamic";

function userTypeLabel(value: string): string {
  return USER_TYPES.find((u) => u.value === value)?.label ?? value;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "jamais";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffDays = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "hier";
  if (diffDays < 7) return `il y a ${diffDays} j`;
  if (diffDays < 30) return `il y a ${Math.floor(diffDays / 7)} sem`;
  return formatDate(iso);
}

export default async function UsersPage() {
  const service = createServiceClient();

  const { data: profiles, error } = await service
    .from("profiles")
    .select("id, full_name, email, user_type, role, company, created_at")
    .order("created_at", { ascending: false });

  const { data: activity } = await service.rpc("admin_user_activity");

  const activityByUser = new Map<
    string,
    { conversation_count: number; message_count: number; last_active: string | null }
  >();
  for (const row of activity ?? []) {
    activityByUser.set(row.user_id, {
      conversation_count: Number(row.conversation_count ?? 0),
      message_count: Number(row.message_count ?? 0),
      last_active: row.last_active,
    });
  }

  const users = profiles ?? [];

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground">
          {users.length} compte{users.length === 1 ? "" : "s"} enregistré{users.length === 1 ? "" : "s"}.
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
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Entreprise</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead className="text-right">Convos</TableHead>
              <TableHead className="text-right">Messages</TableHead>
              <TableHead>Dernière activité</TableHead>
              <TableHead>Inscrit le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Aucun utilisateur.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const stats = activityByUser.get(u.id) ?? {
                  conversation_count: 0,
                  message_count: 0,
                  last_active: null,
                };
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="font-medium hover:underline"
                      >
                        {u.full_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {userTypeLabel(u.user_type)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.company ?? "—"}
                    </TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <Badge variant="default">admin</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          user
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {stats.conversation_count.toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {stats.message_count.toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatRelative(stats.last_active)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(u.created_at)}
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
