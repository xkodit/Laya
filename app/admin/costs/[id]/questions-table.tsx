"use client";

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

export type QuestionRow = {
  question_id: string;
  asked_at: string;
  call_outcome: string;
  models: string[] | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  total_cost: number;
  reason: string | null;
  retrieved_chunks_count: number | null;
  retrieved_chunks_tokens: number | null;
  history_tokens: number | null;
  system_prompt_tokens: number | null;
  user_question_tokens: number | null;
  question_text: string;
};

type Props = {
  rows: QuestionRow[];
  userLabel: string;
};

function n(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "string" ? parseFloat(v) : v;
}
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
  // YYYY-MM-DD for date-input comparison
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function QuestionsTable({ rows, userLabel }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userQ, setUserQ] = useState("");

  const filtered = useMemo(() => {
    const userQLower = userQ.trim().toLowerCase();
    return rows.filter((r) => {
      const d = ymd(r.asked_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (userQLower && !userLabel.toLowerCase().includes(userQLower))
        return false;
      return true;
    });
  }, [rows, from, to, userQ, userLabel]);

  const totals = filtered.reduce(
    (acc, r) => {
      acc.input += n(r.input_tokens) + n(r.cache_read_tokens);
      acc.output += n(r.output_tokens);
      acc.cost += n(r.total_cost);
      return acc;
    },
    { input: 0, output: 0, cost: 0 },
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
            placeholder={userLabel}
            value={userQ}
            onChange={(e) => setUserQ(e.target.value)}
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Date</TableHead>
              <TableHead className="whitespace-nowrap">Utilisateur</TableHead>
              <TableHead className="w-[35%]">Question</TableHead>
              <TableHead>Modèle</TableHead>
              <TableHead className="text-right">Entrée</TableHead>
              <TableHead className="text-right">Sortie</TableHead>
              <TableHead className="text-right">Coût</TableHead>
              <TableHead>Raison</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {rows.length === 0
                    ? "Aucune question suivie pour cette conversation."
                    : "Aucune question ne correspond aux filtres."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const model =
                  r.models && r.models.length > 0
                    ? r.models.join(", ")
                    : r.call_outcome === "cached"
                      ? "cache"
                      : r.call_outcome === "no_llm_call"
                        ? "—"
                        : r.call_outcome;
                return (
                  <TableRow key={r.question_id} className="align-top">
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {dateFmt.format(new Date(r.asked_at))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {userLabel}
                    </TableCell>
                    <TableCell className="max-w-0">
                      <div className="line-clamp-2 text-sm">
                        {r.question_text}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {model}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {tk(n(r.input_tokens) + n(r.cache_read_tokens))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {tk(n(r.output_tokens))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usd(n(r.total_cost))}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.reason ? (
                        <span>
                          {r.reason}
                          {r.retrieved_chunks_count != null ? (
                            <span className="mt-0.5 block opacity-70">
                              ctx {tk(n(r.retrieved_chunks_tokens))} · hist{" "}
                              {tk(n(r.history_tokens))} · sys{" "}
                              {tk(n(r.system_prompt_tokens))} · q{" "}
                              {tk(n(r.user_question_tokens))}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="opacity-50">normal</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          {filtered.length > 0 ? (
            <TableBody>
              <TableRow className="border-t-2 font-medium">
                <TableCell colSpan={4}>
                  Total ({filtered.length} question
                  {filtered.length === 1 ? "" : "s"})
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {tk(totals.input)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {tk(totals.output)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {usd(totals.cost)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          ) : null}
        </Table>
      </div>
    </div>
  );
}
