"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ConversationRow = {
  conversation_id: string;
  title: string | null;
  user_label: string;
  question_count: number;
  free_questions: number;
  total_tokens: number;
  total_cost: number;
  last_at: string | null;
};

type Props = {
  rows: ConversationRow[];
};

function usd(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}
function tk(v: number): string {
  return Math.round(v).toLocaleString("fr-FR");
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function ymd(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ConversationsTable({ rows }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userQ, setUserQ] = useState("");

  const userOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.user_label && r.user_label !== "—") set.add(r.user_label);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const userQLower = userQ.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.last_at) {
        const d = ymd(r.last_at);
        if (from && d < from) return false;
        if (to && d > to) return false;
      } else if (from || to) {
        return false;
      }
      if (userQLower && !r.user_label.toLowerCase().includes(userQLower))
        return false;
      return true;
    });
  }, [rows, from, to, userQ]);

  const totals = filtered.reduce(
    (acc, r) => {
      acc.questions += r.question_count;
      acc.free += r.free_questions;
      acc.tokens += r.total_tokens;
      acc.cost += r.total_cost;
      return acc;
    },
    { questions: 0, free: 0, tokens: 0, cost: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Du</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Au</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Utilisateur</span>
          <Input
            type="search"
            list="users-list"
            placeholder="Tous les utilisateurs"
            value={userQ}
            onChange={(e) => setUserQ(e.target.value)}
          />
          <datalist id="users-list">
            {userOptions.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Date</TableHead>
              <TableHead className="whitespace-nowrap">Utilisateur</TableHead>
              <TableHead>Conversation</TableHead>
              <TableHead className="text-right">Questions</TableHead>
              <TableHead className="text-right">Gratuites</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Coût</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  {rows.length === 0
                    ? "Aucune conversation suivie pour l'instant."
                    : "Aucune conversation ne correspond aux filtres."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.conversation_id}>
                  <TableCell className="whitespace-nowrap text-xs tabular-nums">
                    {c.last_at ? dateFmt.format(new Date(c.last_at)) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {c.user_label}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <Link
                      href={`/admin/costs/${c.conversation_id}`}
                      className="truncate font-medium hover:underline"
                    >
                      {c.title ?? "Sans titre"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.question_count.toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.free_questions.toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tk(c.total_tokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {usd(c.total_cost)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {filtered.length > 0 ? (
            <TableBody>
              <TableRow className="border-t-2 font-medium">
                <TableCell colSpan={3}>
                  Total ({filtered.length} conversation
                  {filtered.length === 1 ? "" : "s"})
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {totals.questions.toLocaleString("fr-FR")}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {totals.free.toLocaleString("fr-FR")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {tk(totals.tokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {usd(totals.cost)}
                </TableCell>
              </TableRow>
            </TableBody>
          ) : null}
        </Table>
      </div>
    </div>
  );
}
