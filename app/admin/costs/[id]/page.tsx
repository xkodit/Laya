import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { QuestionsTable, type QuestionRow } from "./questions-table";

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

type QRowDb = {
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
    .select("id, title, user_id")
    .eq("id", id)
    .single();
  if (!conversation) notFound();

  const [{ data: qRowsRaw }, { data: msgRows }, { data: profile }] =
    await Promise.all([
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
      conversation.user_id
        ? service
            .from("profiles")
            .select("full_name, email")
            .eq("id", conversation.user_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

  const qRowsDb = (qRowsRaw ?? []) as unknown as QRowDb[];
  const questionText = new Map<string, string>();
  for (const m of (msgRows ?? []) as {
    question_id: string | null;
    content: string;
  }[]) {
    if (m.question_id) questionText.set(m.question_id, m.content);
  }

  const rows: QuestionRow[] = qRowsDb.map((r) => ({
    question_id: r.question_id,
    asked_at: r.asked_at,
    call_outcome: r.call_outcome,
    models: r.models,
    input_tokens: n(r.input_tokens),
    output_tokens: n(r.output_tokens),
    cache_read_tokens: n(r.cache_read_tokens),
    total_tokens: n(r.total_tokens),
    total_cost: n(r.total_cost),
    reason: r.reason,
    retrieved_chunks_count: r.retrieved_chunks_count,
    retrieved_chunks_tokens: r.retrieved_chunks_tokens,
    history_tokens: r.history_tokens,
    system_prompt_tokens: r.system_prompt_tokens,
    user_question_tokens: r.user_question_tokens,
    question_text: questionText.get(r.question_id) ?? "—",
  }));

  const userLabel =
    (profile as { full_name?: string | null; email?: string | null } | null)
      ?.full_name ||
    (profile as { full_name?: string | null; email?: string | null } | null)
      ?.email ||
    "—";

  const totals = rows.reduce(
    (acc, r) => {
      acc.total += r.total_tokens;
      acc.cost += r.total_cost;
      return acc;
    },
    { total: 0, cost: 0 },
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
          {userLabel} · {rows.length} question{rows.length === 1 ? "" : "s"} ·{" "}
          {tk(totals.total)} tokens · {usd(totals.cost)}
        </p>
      </header>

      <QuestionsTable rows={rows} userLabel={userLabel} />
    </div>
  );
}
