"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus,
  Star,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  FileText,
  FileType,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  toggleFavorite,
  renameConversation,
  deleteConversation,
  getConversationTranscript,
} from "@/app/chat/conversation-actions";

type ConversationRow = {
  id: string;
  title: string | null;
  is_favorite: boolean;
  updated_at: string;
};

type DialogState =
  | { kind: "rename"; convo: ConversationRow }
  | { kind: "delete"; convo: ConversationRow }
  | null;

export function ChatSidebar({
  conversations,
}: {
  conversations: ConversationRow[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = pathname?.startsWith("/chat/")
    ? pathname.split("/")[2]
    : null;

  const [dialog, setDialog] = useState<DialogState>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function openRename(convo: ConversationRow) {
    setRenameValue(convo.title ?? "");
    setDialog({ kind: "rename", convo });
  }

  function openDelete(convo: ConversationRow) {
    setDialog({ kind: "delete", convo });
  }

  async function handleRename() {
    if (dialog?.kind !== "rename") return;
    setBusy(true);
    const res = await renameConversation(dialog.convo.id, renameValue);
    setBusy(false);
    if (res.ok) {
      setDialog(null);
      startTransition(() => router.refresh());
    }
  }

  async function handleDelete() {
    if (dialog?.kind !== "delete") return;
    setBusy(true);
    const res = await deleteConversation(dialog.convo.id);
    setBusy(false);
    if (res.ok) {
      const wasActive = dialog.convo.id === activeId;
      setDialog(null);
      if (wasActive) router.push("/chat");
      else startTransition(() => router.refresh());
    }
  }

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
            {conversations.map((c) => (
              <ConversationItem
                key={c.id}
                convo={c}
                isActive={c.id === activeId}
                onRename={() => openRename(c)}
                onDelete={() => openDelete(c)}
              />
            ))}
          </ul>
        )}
      </nav>

      <Dialog
        open={dialog?.kind === "rename"}
        onOpenChange={(open) => !open && !busy && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer la conversation</DialogTitle>
            <DialogDescription>
              Choisis un titre court qui t&apos;aide à retrouver cette conversation.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim()) handleRename();
            }}
            placeholder="Titre de la conversation"
            disabled={busy}
            autoFocus
            maxLength={200}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialog(null)}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleRename}
              disabled={busy || renameValue.trim().length === 0}
            >
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => !open && !busy && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer cette conversation ?</DialogTitle>
            <DialogDescription>
              Cette action est définitive. Tous les messages de «{" "}
              <span className="font-medium text-foreground">
                {dialog?.kind === "delete"
                  ? dialog.convo.title?.trim() || "Sans titre"
                  : ""}
              </span>{" "}
              » seront supprimés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialog(null)}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={busy}
            >
              {busy ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConversationItem({
  convo,
  isActive,
  onRename,
  onDelete,
}: {
  convo: ConversationRow;
  isActive: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "favorite" | "copy" | "pdf" | "docx" | null
  >(null);
  const [, startTransition] = useTransition();

  async function handleFavorite() {
    setPendingAction("favorite");
    await toggleFavorite(convo.id, !convo.is_favorite);
    setPendingAction(null);
    setMenuOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleCopy() {
    setPendingAction("copy");
    const res = await getConversationTranscript(convo.id);
    setPendingAction(null);
    setMenuOpen(false);
    if (!res.ok) return;
    const text = formatTranscriptAsText(res.transcript);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard may be denied; ignore silently for now
    }
  }

  function handleDownload(format: "pdf" | "docx") {
    setPendingAction(format);
    // Force a download by navigating to the route in a hidden way. Using an
    // anchor with download attr keeps the user on the page; the browser
    // resolves the attachment header and saves the file.
    const a = document.createElement("a");
    a.href = `/api/conversations/${convo.id}/download?format=${format}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // No reliable "download finished" event — reset shortly after.
    setTimeout(() => setPendingAction(null), 1500);
    setMenuOpen(false);
  }

  const displayTitle = convo.title?.trim() || "Sans titre";

  return (
    <li className="group/row relative">
      <Link
        href={`/chat/${convo.id}`}
        className={cn(
          "flex items-center gap-2 truncate rounded-md py-2 pr-9 pl-3 text-sm transition",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-foreground/80 hover:bg-accent/60",
        )}
      >
        {convo.is_favorite ? (
          <Star className="size-3.5 shrink-0 fill-brand-gold text-brand-gold" />
        ) : null}
        <span className="truncate">{displayTitle}</span>
      </Link>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Options de la conversation"
            className={cn(
              "absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground",
              "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
              "data-[state=open]:opacity-100 data-[state=open]:bg-background data-[state=open]:text-foreground",
              "max-md:opacity-100",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {pendingAction ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <MoreHorizontal className="size-3.5" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={handleFavorite}>
            <Star
              className={cn(
                "size-4",
                convo.is_favorite && "fill-brand-gold text-brand-gold",
              )}
            />
            {convo.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setMenuOpen(false);
              onRename();
            }}
          >
            <Pencil className="size-4" />
            Renommer
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleCopy}>
            <Copy className="size-4" />
            Copier la conversation
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => handleDownload("pdf")}>
            <FileText className="size-4" />
            Télécharger en PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleDownload("docx")}>
            <FileType className="size-4" />
            Télécharger en Word
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              setMenuOpen(false);
              onDelete();
            }}
          >
            <Trash2 className="size-4" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function formatTranscriptAsText(transcript: {
  title: string;
  createdAt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): string {
  const header = `${transcript.title}\n${"-".repeat(transcript.title.length)}\n`;
  const body = transcript.messages
    .map((m) => `${m.role === "user" ? "Vous" : "Laya"} :\n${m.content}`)
    .join("\n\n");
  return `${header}\n${body}\n`;
}
