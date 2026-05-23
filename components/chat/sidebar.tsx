"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type ConversationRow = {
  id: string;
  title: string | null;
  is_favorite: boolean;
  updated_at: string;
};

export function ChatSidebar({
  conversations,
}: {
  conversations: ConversationRow[];
}) {
  const pathname = usePathname();
  const activeId = pathname?.startsWith("/chat/")
    ? pathname.split("/")[2]
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
      <Link
        href="/chat"
        className="mb-1 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-accent"
      >
        <Plus className="size-4" />
        Nouvelle conversation
      </Link>

      <nav className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Aucune conversation pour l&apos;instant.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {conversations.map((c) => {
              const isActive = c.id === activeId;
              return (
                <li key={c.id}>
                  <Link
                    href={`/chat/${c.id}`}
                    className={cn(
                      "flex items-center gap-2 truncate rounded-md px-3 py-2 text-sm transition",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground/80 hover:bg-accent/60",
                    )}
                  >
                    {c.is_favorite ? (
                      <Star className="size-3.5 shrink-0 fill-brand-gold text-brand-gold" />
                    ) : null}
                    <span className="truncate">
                      {c.title?.trim() || "Sans titre"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </div>
  );
}
