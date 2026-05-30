import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

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

type QRow = {
  question_id: string;
  asked_at: string;
  call_outcome: string;
  cache_hit: boolean;
  models: string[] | null;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  total_cost: number;
  reason: string | null;
  reason_flags: string[] | null;
  retrieved_chunks_count: number | null;
  retrieved_chunks_tokens: number | null;
  history_tokens: number | null;
  system_prompt_tokens: number | null;
  user_question_tokens: number | null;
};

export default async function CostDrilldownPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = createServiceClient();

  const { data: conversation } = await service
    .from("conversations")
    .select("id, title")
    .eq("id", id)
    .single();
  if (!conversation) notFound();

  const [{ data: qRowsRaw }, { data: msgRows }] = await Promise.all([
    service
      .from("llm_per_question")
      .select("*")
      .eq("conversation_id", id)
      .order("asked_at", { ascending: true }),
    service
      .from("messages")
      .select("question_id, content, role")
      .eq("conversation_id", id)
      .eq("role", "user"),
  ]);

  const qRows = (qRowsRaw ?? []) as unknown as QRow[];
  const questionText = new Map<string, string>();
  for (const m of (msgRows ?? []) as {
    question_id: string | null;
    content: string;
  }[]) {
    if (m.question_id) questionText.set(m.question_id, m.content);
  }

  // Entrée = all input-billed tokens (non-cached + cache read + cache write),
  // derived as total - output so it reconciles by construction with the
  // header total and with each row's total_tokens.
  const totals = qRows.reduce(
    (acc, r) => {
      const total = n(r.total_tokens);
      const output = n(r.output_tokens);
      acc.input += total - output;
      acc.output += output;
      acc.total += total;
      acc.cost += n(r.total_cost);
      return acc;
    },
    { input: 0, output: 0, total: 0, cost: 0 },
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/admin/costs"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Coûts IA
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {conversation.title ?? "Sans titre"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {qRows.length} question{qRows.length === 1 ? "" : "s"} ·{" "}
          {tk(totals.total)} tokens · {usd(totals.cost)}
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Question</TableHead>
              <TableHead>Modèle</TableHead>
              <TableHead className="text-right">Entrée</TableHead>
              <TableHead className="text-right">Sortie</TableHead>
              <TableHead className="text-right">Coût</TableHead>
              <TableHead>Raison</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Aucune question suivie pour cette conversation.
                </TableCell>
              </TableRow>
            ) : (
              qRows.map((r) => {
                const model =
                  r.models && r.models.length > 0
                    ? r.models.join(", ")
                    : r.call_outcome === "cached"
                      ? "cache"
                      : r.call_outcome === "no_llm_call"
                        ? "—"
                        : r.call_outcome;
                const text = questionText.get(r.question_id) ?? "—";
                return (
                  <TableRow key={r.question_id} className="align-top">
                    <TableCell className="max-w-0">
                      <div className="line-clamp-2 text-sm">{text}</div>
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
          {qRows.length > 0 ? (
            <TableBody>
              <TableRow className="border-t-2 font-medium">
                <TableCell>Total</TableCell>
                <TableCell />
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
