"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type Citation = {
  document_id?: string;
  document_title?: string;
  cited_text?: string;
  start_char?: number;
  end_char?: number;
};

type Message = {
  id: string;
  role: string;
  content: string;
  citations: Citation[] | null;
  tool_calls: unknown;
  created_at: string;
};

const ROLE_LABEL: Record<string, string> = {
  user: "Utilisateur",
  assistant: "Laya",
  tool: "Outil",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConversationViewer({ messages }: { messages: Message[] }) {
  const params = useSearchParams();
  const focusedId = params.get("msg");
  const focusedRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (focusedRef.current) {
      focusedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusedId]);

  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Aucun message.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {messages.map((m) => {
        const isUser = m.role === "user";
        const isFocused = focusedId === m.id;
        return (
          <li
            key={m.id}
            ref={isFocused ? focusedRef : null}
            className={cn(
              "rounded-lg border bg-background p-4 transition-shadow",
              isFocused
                ? "border-primary ring-2 ring-primary/20"
                : "border-border",
            )}
          >
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span
                className={cn(
                  "font-semibold uppercase tracking-wider",
                  isUser ? "text-muted-foreground" : "text-primary",
                )}
              >
                {ROLE_LABEL[m.role] ?? m.role}
              </span>
              <span className="text-muted-foreground">
                {formatTime(m.created_at)}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
              {m.content}
            </p>
            {m.citations && m.citations.length > 0 ? (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  {m.citations.length} citation
                  {m.citations.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-2 space-y-2">
                  {m.citations.map((c, i) => (
                    <li
                      key={i}
                      className="rounded-md bg-muted/40 p-2 leading-relaxed"
                    >
                      {c.document_title ? (
                        <div className="font-medium text-foreground">
                          {c.document_title}
                        </div>
                      ) : null}
                      {c.cited_text ? (
                        <blockquote className="mt-1 border-l-2 border-border pl-2 text-muted-foreground">
                          {c.cited_text}
                        </blockquote>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
