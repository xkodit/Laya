"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Coins,
  FileText,
  MessageSquare,
  ThumbsUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/app/user-menu";

const NAV_ITEMS = [
  { href: "/admin/documents", label: "Documents", icon: FileText },
  { href: "/admin/users", label: "Utilisateurs", icon: Users },
  { href: "/admin/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/admin/feedback", label: "Retours", icon: ThumbsUp },
  { href: "/admin/costs", label: "Coûts IA", icon: Coins },
];

type Props = {
  profile: { full_name: string; email: string };
};

export function AdminSidebar({ profile }: Props) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <Image src="/brand/logo.png" alt="Laya" width={24} height={24} priority />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">Laya</span>
          <span className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
            admin
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-2 py-3 space-y-1">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" />
          Retour à l&apos;application
        </Link>
        <div className="flex items-center justify-between rounded-md px-2.5 py-2">
          <div className="flex flex-col leading-tight overflow-hidden">
            <span className="truncate text-sm font-medium">{profile.full_name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {profile.email}
            </span>
          </div>
          <UserMenu
            fullName={profile.full_name}
            email={profile.email}
            isAdmin
          />
        </div>
      </div>
    </aside>
  );
}
