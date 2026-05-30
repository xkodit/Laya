"use client";

import { useEffect, useState } from "react";
import { FileText, Info, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

export type CitedChunk = {
  id: string;
  article?: string | null;
  section?: string | null;
  doc: string;
  primary: boolean;
  content: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline citation badge — e.g. [Art. L.16.7] rendered as a subtle indigo pill.
// ─────────────────────────────────────────────────────────────────────────────

export function Citation({
  label,
  chunk,
  onOpen,
}: {
  label: string;
  chunk: CitedChunk | null;
  onOpen?: (chunk: CitedChunk) => void;
}) {
  const isLinked = chunk !== null && onOpen !== undefined;

  // Unresolved bracket (no matching chunk) — render as a dim non-interactive
  // badge so the reader still sees a citation marker.
  if (!isLinked) {
    return (
      <span
        className="mx-0.5 inline-flex items-center rounded-md border border-border bg-muted/60 px-1.5 py-px align-baseline text-[11px] font-medium leading-none text-muted-foreground"
        title="Source non trouvée"
      >
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(chunk)}
      className="mx-0.5 inline-flex cursor-pointer items-center rounded-md border border-brand-indigo/20 bg-brand-indigo/8 px-1.5 py-px align-baseline text-[11px] font-medium leading-none text-brand-indigo outline-none transition hover:border-brand-indigo/35 hover:bg-brand-indigo/14 focus-visible:ring-2 focus-visible:ring-brand-indigo/40 dark:border-brand-indigo-dark/40 dark:bg-brand-indigo-dark/20 dark:text-brand-indigo-dark"
      aria-label={`Voir la source : ${label}`}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lane marker — prepends a general-knowledge paragraph (amber accent).
// ─────────────────────────────────────────────────────────────────────────────

export function InfoLane() {
  return (
    <span className="mr-1.5 inline-flex items-center gap-1 rounded-md border border-brand-gold/40 bg-brand-gold/12 px-1.5 py-0.5 align-baseline text-[11px] font-medium leading-none text-amber-700 dark:bg-brand-gold/15 dark:text-brand-gold">
      <Info className="size-3" />
      Info générale, non sourcée
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Side panel — opens when a citation is clicked, shows the cited source span.
// ─────────────────────────────────────────────────────────────────────────────

export function CitedDocPanel({
  chunk,
  open,
  onOpenChange,
}: {
  chunk: CitedChunk | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Fetch the FULL article (all chunks for the same document_id + article_ref)
  // when the panel opens. The chat persists only the chunks Voyage rerank
  // surfaced — usually a single chunk per article — but the article-aware
  // chunker splits articles >1500 chars into multiple pieces, so a cited
  // article may only be partially visible from the persisted chunk alone.
  // The API joins all parts in chunk_index order so the reader can verify the
  // cited claim against the whole article. Falls back to the persisted chunk
  // content on any fetch failure so the panel never goes empty.
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [partCount, setPartCount] = useState<number>(1);

  useEffect(() => {
    if (!open || !chunk) {
      setFullContent(null);
      setPartCount(1);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (chunk.id) params.set("chunkId", chunk.id);
    if (chunk.article) params.set("article", chunk.article);
    fetch(`/api/citation/article?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { content?: string; chunkCount?: number } | null) => {
        if (cancelled) return;
        if (data?.content) {
          setFullContent(data.content);
          setPartCount(data.chunkCount ?? 1);
        }
      })
      .catch(() => {
        // Silent fallback — the chunk's own content is still rendered below.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, chunk]);

  const displayContent = fullContent ?? chunk?.content ?? "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border bg-background px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="size-3.5" />
            <span className="truncate">{chunk?.doc ?? ""}</span>
            {chunk?.primary === false ? (
              <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">
                Source secondaire
              </Badge>
            ) : null}
          </div>
          <SheetTitle className="text-xl font-semibold text-brand-indigo dark:text-brand-indigo-dark">
            {chunk?.article ?? "Source"}
          </SheetTitle>
          {chunk?.section ? (
            <SheetDescription className="text-xs">
              {chunk.section}
            </SheetDescription>
          ) : null}
          {partCount > 1 ? (
            <p className="text-[11px] text-muted-foreground">
              Article complet ({partCount} sections)
            </p>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {loading && !fullContent ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Chargement de l&apos;article complet…
            </div>
          ) : null}
          {chunk ? (
            <div className="border-l-2 border-brand-gold/70 bg-brand-gold/5 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {displayContent}
              </p>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
