"use client";

import { useMemo, useState } from "react";
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
  output_tokens: number;
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
  totals: { input: number; output: number; cost: number };
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

export function QuestionsTable({ rows, totals }: Props) {
  const [dateSort, setDateSort] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const at = Date.parse(a.asked_at);
      const bt = Date.parse(b.asked_at);
      return dateSort === "desc" ? bt - at : at - bt;
    });
  }, [rows, dateSort]);

  function toggleDateSort() {
    setDateSort((d) => (d === "asc" ? "desc" : "asc"));
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">
              <button
                type="button"
                onClick={toggleDateSort}
                className="inline-flex items-center gap-1 hover:text-foreground"
                title={
                  dateSort === "asc"
                    ? "Trier par date (plus récent d'abord)"
                    : "Trier par date (plus ancien d'abord)"
                }
              >
                Date
                <span className="text-xs tabular-nums opacity-70">
                  {dateSort === "desc" ? "↓" : "↑"}
                </span>
              </button>
            </TableHead>
            <TableHead className="w-[40%]">Question</TableHead>
            <TableHead>Modèle</TableHead>
            <TableHead className="text-right">Entrée</TableHead>
            <TableHead className="text-right">Sortie</TableHead>
            <TableHead className="text-right">Coût</TableHead>
            <TableHead>Raison</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                Aucune question suivie pour cette conversation.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((r) => {
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
                  <TableCell className="max-w-0">
                    <div className="line-clamp-2 text-sm">
                      {r.question_text}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {model}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tk(n(r.total_tokens) - n(r.output_tokens))}
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
        {sorted.length > 0 ? (
          <TableBody>
            <TableRow className="border-t-2 font-medium">
              <TableCell colSpan={3}>Total</TableCell>
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
  );
}
