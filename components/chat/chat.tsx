"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send, Loader2, Square, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnswerRenderer } from "./answer-renderer";
import { CitedDocPanel, type CitedChunk } from "./citation";
import {
  MessageActions,
  EMPTY_FEEDBACK,
  type FeedbackState,
} from "./message-actions";

type Props = {
  conversationId: string;
  initialMessages: UIMessage[];
  initialChunksByIndex: Record<number, CitedChunk[]>;
  initialFeedback: Record<number, FeedbackState>;
};

export function Chat({
  conversationId,
  initialMessages,
  initialChunksByIndex,
  initialFeedback,
}: Props) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [activeChunk, setActiveChunk] = useState<CitedChunk | null>(null);
  const isFreshConversation = initialMessages.length === 0;

  const { messages, sendMessage, status, stop, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages, id }) => ({
        body: { id, message: messages[messages.length - 1] },
      }),
    }),
    onFinish: () => {
      // First turn just created the conversation server-side — refresh the
      // server-rendered sidebar so it appears in the list.
      if (isFreshConversation) {
        router.refresh();
      }
    },
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, status]);

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((m, index) => {
              const isLast = index === messages.length - 1;
              const isStreamingThis = isBusy && isLast;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  chunks={chunksForMessage(m, index, initialChunksByIndex)}
                  onOpenChunk={setActiveChunk}
                  conversationId={conversationId}
                  messageIndex={index}
                  initialFeedback={
                    initialFeedback[index] ?? EMPTY_FEEDBACK
                  }
                  showActions={!isStreamingThis}
                />
              );
            })
          )}
          {status === "submitted" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Laya réfléchit…
            </div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Une erreur est survenue. Recharge la page ou réessaie.
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border bg-background">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = input.trim();
            if (!text || isBusy) return;
            sendMessage({ text });
            setInput("");
          }}
          className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-4 sm:px-6"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Pose ta question à Laya…"
            rows={1}
            className="min-h-11 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            disabled={isBusy && status !== "streaming"}
          />
          {isBusy ? (
            <button
              type="button"
              onClick={() => stop()}
              className="grid size-11 place-items-center rounded-lg bg-foreground text-background transition hover:opacity-80"
              aria-label="Arrêter"
            >
              <Square className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              aria-label="Envoyer"
            >
              <Send className="size-4" />
            </button>
          )}
        </form>
      </div>

      <CitedDocPanel
        chunk={activeChunk}
        open={activeChunk !== null}
        onOpenChange={(open) => {
          if (!open) setActiveChunk(null);
        }}
      />
    </div>
  );
}

// Chunks for a single message: citations persisted with that DB row (when this
// is a reloaded message), plus any chunks streaming in via tool-call outputs on
// the live message. Scoping per turn — instead of pooling across the whole
// conversation — keeps citation lookup deterministic when several turns cite
// articles from the same document.
function chunksForMessage(
  message: UIMessage,
  index: number,
  initialMap: Record<number, CitedChunk[]>,
): CitedChunk[] {
  const seen = new Set<string>();
  const out: CitedChunk[] = [];
  const push = (c: CitedChunk | null | undefined) => {
    if (c && c.id && !seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  };
  for (const c of initialMap[index] ?? []) push(c);
  for (const part of message.parts) {
    if (!part.type.startsWith("tool-")) continue;
    const output = (part as { output?: { chunks?: CitedChunk[] } }).output;
    if (!output?.chunks) continue;
    for (const c of output.chunks) push(c);
  }
  return out;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Salut, je suis Laya.
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Pose-moi tes questions sur le droit du travail ivoirien. Je cite mes
        sources.
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  chunks,
  onOpenChunk,
  conversationId,
  messageIndex,
  initialFeedback,
  showActions,
}: {
  message: UIMessage;
  chunks: CitedChunk[];
  onOpenChunk: (chunk: CitedChunk) => void;
  conversationId: string;
  messageIndex: number;
  initialFeedback: FeedbackState;
  showActions: boolean;
}) {
  const isUser = message.role === "user";
  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
  const toolParts = message.parts.filter((p) => p.type.startsWith("tool-"));

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        {toolParts.map((part, i) => (
          <ToolBadge key={`t-${i}`} part={part} />
        ))}
        {isUser ? (
          text
        ) : (
          <AnswerRenderer
            text={text}
            chunks={chunks}
            onOpenChunk={onOpenChunk}
          />
        )}
      </div>
      {!isUser && showActions && text.length > 0 ? (
        <MessageActions
          conversationId={conversationId}
          messageIndex={messageIndex}
          initial={initialFeedback}
        />
      ) : null}
    </div>
  );
}

function ToolBadge({ part }: { part: { type: string; input?: unknown } }) {
  const query =
    part.input &&
    typeof part.input === "object" &&
    "query" in (part.input as Record<string, unknown>)
      ? String((part.input as { query: unknown }).query)
      : null;
  return (
    <span className="my-1 mr-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 text-xs text-muted-foreground">
      <Search className="size-3" />
      {query ? `Recherche : « ${query} »` : "Recherche dans le corpus"}
    </span>
  );
}
