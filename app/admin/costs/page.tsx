import { createServiceClient } from "@/lib/supabase/service";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GEMINI_CACHE_STORAGE_PER_1M_PER_HOUR } from "@/lib/llm/config";
import {
  ConversationsTable,
  type ConversationRow,
} from "./conversations-table";

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

function tokens(v: number): string {
  return Math.round(v).toLocaleString("fr-FR");
}

type ModelDaily = {
  day: string;
  model: string;
  provider: string;
  calls: number;
  questions: number;
  total_tokens: number;
  total_cost: number;
};

type ConvRow = {
  conversation_id: string;
  question_count: number;
  free_questions: number;
  call_count: number;
  total_tokens: number;
  total_cost: number;
  models: string[] | null;
  last_at: string;
};

export default async function CostsOverviewPage() {
  const service = createServiceClient();

  const [{ data: modelRows }, { data: convRowsRaw }] = await Promise.all([
    service.from("llm_per_model_daily").select("*"),
    service
      .from("llm_per_conversation")
      .select("*")
      .order("total_cost", { ascending: false })
      .limit(100),
  ]);

  const md = (modelRows ?? []) as unknown as ModelDaily[];
  const convRows = (convRowsRaw ?? []) as unknown as ConvRow[];

  // Aggregate the overview from the per-model-daily view.
  const byModel = new Map<
    string,
    { cost: number; questions: number; tokens: number; calls: number }
  >();
  let answeredSpend = 0;
  let answeredQuestions = 0;
  let freeQuestions = 0;
  for (const r of md) {
    const isFree = r.provider === "none";
    if (isFree) {
      freeQuestions += n(r.questions);
      continue;
    }
    answeredSpend += n(r.total_cost);
    answeredQuestions += n(r.questions);
    const cur = byModel.get(r.model) ?? {
      cost: 0,
      questions: 0,
      tokens: 0,
      calls: 0,
    };
    cur.cost += n(r.total_cost);
    cur.questions += n(r.questions);
    cur.tokens += n(r.total_tokens);
    cur.calls += n(r.calls);
    byModel.set(r.model, cur);
  }
  const totalSpend = answeredSpend;
  const avgPerAnswered = answeredQuestions ? answeredSpend / answeredQuestions : 0;
  const estSavings = freeQuestions * avgPerAnswered;
  const totalQuestions = answeredQuestions + freeQuestions;
  const freeRate = totalQuestions ? freeQuestions / totalQuestions : 0;
  // Gemini context-cache storage, netted (token-tracking-spec §11): ~3,500
  // cached tokens × 720h/mo × rate. Flat config estimate.
  const geminiStorageMonthly =
    (3500 / 1_000_000) * 720 * GEMINI_CACHE_STORAGE_PER_1M_PER_HOUR;

  // Conversation titles + owner for the list (the view has neither).
  const ids = convRows.map((c) => c.conversation_id);
  const titleById = new Map<string, string | null>();
  const userIdById = new Map<string, string | null>();
  const userLabelById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: convos } = await service
      .from("conversations")
      .select("id, title, user_id")
      .in("id", ids);
    const userIds = new Set<string>();
    for (const c of (convos ?? []) as {
      id: string;
      title: string | null;
      user_id: string | null;
    }[]) {
      titleById.set(c.id, c.title);
      userIdById.set(c.id, c.user_id);
      if (c.user_id) userIds.add(c.user_id);
    }
    if (userIds.size > 0) {
      const { data: profs } = await service
        .from("profiles")
        .select("id, full_name, email")
        .in("id", [...userIds]);
      const labelByUser = new Map<string, string>();
      for (const p of (profs ?? []) as {
        id: string;
        full_name: string | null;
        email: string | null;
      }[]) {
        labelByUser.set(p.id, p.full_name || p.email || "—");
      }
      for (const [convId, uid] of userIdById.entries()) {
        userLabelById.set(convId, (uid && labelByUser.get(uid)) || "—");
      }
    }
  }

  const convDisplay: ConversationRow[] = convRows.map((c) => ({
    conversation_id: c.conversation_id,
    title: titleById.get(c.conversation_id) ?? null,
    user_label: userLabelById.get(c.conversation_id) ?? "—",
    question_count: n(c.question_count),
    free_questions: n(c.free_questions),
    total_tokens: n(c.total_tokens),
    total_cost: n(c.total_cost),
    last_at: c.last_at ?? null,
  }));

  const modelList = [...byModel.entries()].sort((a, b) => b[1].cost - a[1].cost);

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Coûts IA</h1>
        <p className="text-sm text-muted-foreground">
          Consommation de tokens et coût par modèle, par conversation. Données
          exactes issues des fournisseurs.
        </p>
      </header>

      {md.length === 0 ? (
        <div className="rounded-md border border-border bg-background p-6 text-sm text-muted-foreground">
          Aucune donnée pour l&apos;instant — les coûts apparaîtront dès que des
          messages passeront par le chat sur ce déploiement.
        </div>
      ) : null}

      {/* Scorecard */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Dépense totale" value={usd(totalSpend)} />
        <Stat
          label="Questions (payantes)"
          value={answeredQuestions.toLocaleString("fr-FR")}
          sub={`${usd(avgPerAnswered)} / question en moyenne`}
        />
        <Stat
          label="Questions gratuites"
          value={freeQuestions.toLocaleString("fr-FR")}
          sub={`${(freeRate * 100).toFixed(0)}% des questions`}
        />
        <Stat
          label="Économies estimées"
          value={usd(estSavings)}
          sub={`cache/greeting évités`}
        />
      </div>

      {/* Spend by model */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">Par modèle</h2>
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Modèle</TableHead>
                <TableHead className="text-right">Questions</TableHead>
                <TableHead className="text-right">Appels</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Coût</TableHead>
                <TableHead className="text-right">Part</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelList.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    —
                  </TableCell>
                </TableRow>
              ) : (
                modelList.map(([model, s]) => (
                  <TableRow key={model}>
                    <TableCell className="font-medium">{model}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.questions.toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.calls.toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {tokens(s.tokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usd(s.cost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {totalSpend ? ((s.cost / totalSpend) * 100).toFixed(0) : 0}
                      %
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          À déduire : ~{usd(geminiStorageMonthly)}/mois de stockage du cache
          contexte Gemini (estimation, voir spec §11).
        </p>
      </section>

      {/* Conversation drill-down list */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Par conversation
        </h2>
        <ConversationsTable rows={convDisplay} />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}
