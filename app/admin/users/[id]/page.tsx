import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
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

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select(
      "id, full_name, email, user_type, role, company, preferred_language, created_at",
    )
    .eq("id", id)
    .single();

  if (!profile) {
    notFound();
  }

  const { data: convs } = await service
    .from("conversations")
    .select("id, title, language, is_favorite, created_at, updated_at, messages(count)")
    .eq("user_id", id)
    .order("updated_at", { ascending: false });

  const conversations = convs ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Utilisateurs
        </Link>
      </div>

      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {profile.full_name}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{profile.email}</span>
          <span>·</span>
          <span>{userTypeLabel(profile.user_type)}</span>
          {profile.company ? (
            <>
              <span>·</span>
              <span>{profile.company}</span>
            </>
          ) : null}
          <span>·</span>
          {profile.role === "admin" ? (
            <Badge>admin</Badge>
          ) : (
            <span>user</span>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-background p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            Langue préférée
          </dt>
          <dd className="mt-1">{profile.preferred_language ?? "fr"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            Conversations
          </dt>
          <dd className="mt-1 tabular-nums">{conversations.length}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            Inscrit le
          </dt>
          <dd className="mt-1">{formatDate(profile.created_at)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            ID
          </dt>
          <dd className="mt-1 truncate font-mono text-xs">{profile.id}</dd>
        </div>
      </dl>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Conversations</h2>

        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Langue</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead>Créée</TableHead>
                <TableHead>Mise à jour</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Aucune conversation.
                  </TableCell>
                </TableRow>
              ) : (
                conversations.map((c) => {
                  const messageCount =
                    (c.messages as { count: number }[] | null)?.[0]?.count ?? 0;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          href={`/admin/conversations/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.title ?? "Sans titre"}
                          {c.is_favorite ? (
                            <span className="ml-2 text-amber-500">★</span>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {c.language}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {messageCount.toLocaleString("fr-FR")}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(c.created_at)}
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
      </section>
    </div>
  );
}
