"use client";

import { FileText, Info } from "lucide-react";
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
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {chunk ? (
            <div className="border-l-2 border-brand-gold/70 bg-brand-gold/5 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {chunk.content}
              </p>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
