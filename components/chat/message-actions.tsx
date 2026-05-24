"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Flag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  setMessageRating,
  reportMessage,
} from "@/app/chat/feedback-actions";

export type FeedbackState = {
  rating: "up" | "down" | null;
  reported: boolean;
};

export const EMPTY_FEEDBACK: FeedbackState = { rating: null, reported: false };

export function MessageActions({
  conversationId,
  messageIndex,
  initial,
  onChange,
}: {
  conversationId: string;
  messageIndex: number;
  initial: FeedbackState;
  onChange?: (next: FeedbackState) => void;
}) {
  const [state, setState] = useState<FeedbackState>(initial);
  const [busy, setBusy] = useState<"up" | "down" | "report" | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportComment, setReportComment] = useState("");

  function commit(next: FeedbackState) {
    setState(next);
    onChange?.(next);
  }

  async function handleRating(target: "up" | "down") {
    if (busy) return;
    const prev = state;
    const nextRating = state.rating === target ? null : target;
    commit({ ...state, rating: nextRating });
    setBusy(target);
    const res = await setMessageRating({
      conversationId,
      messageIndex,
      rating: nextRating,
    });
    setBusy(null);
    if (!res.ok) commit(prev);
  }

  async function handleReportSubmit() {
    if (busy) return;
    const prev = state;
    commit({ ...state, reported: true });
    setBusy("report");
    const res = await reportMessage({
      conversationId,
      messageIndex,
      comment: reportComment,
    });
    setBusy(null);
    if (!res.ok) {
      commit(prev);
    } else {
      setReportOpen(false);
      setReportComment("");
    }
  }

  return (
    <>
      <div className="mt-1 flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => handleRating("up")}
          disabled={busy !== null}
          aria-label="Réponse utile"
          aria-pressed={state.rating === "up"}
          className={cn(
            "grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50",
            state.rating === "up" && "bg-muted text-primary",
          )}
        >
          {busy === "up" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ThumbsUp className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => handleRating("down")}
          disabled={busy !== null}
          aria-label="Réponse inutile"
          aria-pressed={state.rating === "down"}
          className={cn(
            "grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50",
            state.rating === "down" && "bg-muted text-foreground",
          )}
        >
          {busy === "down" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ThumbsDown className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          disabled={busy !== null}
          aria-label={state.reported ? "Signalement envoyé" : "Signaler une erreur"}
          title={state.reported ? "Signalement envoyé" : "Signaler une erreur"}
          className={cn(
            "ml-1 grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50",
            state.reported && "text-destructive",
          )}
        >
          <Flag className="size-3.5" />
        </button>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signaler cette réponse</DialogTitle>
            <DialogDescription>
              {state.reported
                ? "Tu as déjà signalé cette réponse. Tu peux ajouter ou remplacer ton commentaire."
                : "Aide-nous à améliorer Laya. Qu'est-ce qui ne va pas ?"}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reportComment}
            onChange={(e) => setReportComment(e.target.value)}
            placeholder="Citation inventée, ton inapproprié, réponse fausse, sujet sensible mal géré…"
            rows={4}
            className="resize-none"
            disabled={busy === "report"}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReportOpen(false)}
              disabled={busy === "report"}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleReportSubmit}
              disabled={busy === "report"}
            >
              {busy === "report" ? "Envoi…" : "Signaler"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
