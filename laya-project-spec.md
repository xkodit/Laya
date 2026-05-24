# Laya — Ivorian Labor Law AI Assistant

> **Project specification — v2 (locked 2026-05-21)**
> Supersedes the v1 specification. Reflects scope, stack, and architecture decisions from the 2026-05-16 and 2026-05-21 planning interviews. This document is the contract; the v1 wishlist is retired.

---

## 0. Status (as of 2026-05-24)

**Decision: GO.** Branding locked, all architectural decisions locked. Coding underway since 2026-05-22.

### Pickup-point questions — resolved 2026-05-22

1. **GitHub repo** — `xkodit/Laya` (private). Pushed initial commit `a1be10d` (spec + branding + env template).
2. **Supabase region** — `eu-west-1` (Ireland). Project ref `oyfxljzdjyebescnouvo`. Slightly farther than the original Paris recommendation; latency cost accepted for region maturity.

### Phase A progress (week-by-week against §11)

- [x] **Week 1–2: Foundation** — Next.js 16 + Tailwind v4 + Plus Jakarta Sans + brand tokens; Supabase SSR + email/password auth; closed-beta allowlist; admin gate; `profiles` + `conversations` + `messages` + `documents` + `document_chunks` + `subscriptions` + `usage_events` + `contract_templates` + `beta_requests` schema with RLS; `admin_user_activity` RPC; `documents` status CHECK.
- [x] **Week 2–3: Local Python ingestion** — `scripts/ingest.py` with article-aware chunking, Voyage `voyage-3` embeddings, Claude vision OCR fallback for scanned PDFs, corpus storage bucket. `--from-pending` mode drains admin-uploaded documents. Two launch PDFs ingested. `match_chunks` RPC + smoke-test script proves vector retrieval returns sane results.
- [x] **Profile + admin moderation** (week 6–7 work pulled forward) — `/profile` page with edit, change-password, account delete; admin views for documents, users, conversations, feedback.
- [x] **Week 3–5: Streaming chat with tool-calling agent** — done in v1 form (commit `cc0402e`). See *Chat implementation snapshot* below for what's in and what's deferred.
- [~] **Week 5–6: Eval set (50 Q&A) + runner** — brief + template shipped (commit `ce18cd4`). First tester (admin@kodit.ai friend) returned **11/50 filled** on 2026-05-24 — see *Eval set — first tester findings* below. Runner deferred until ≥25 filled rows.
- [~] **Week 6–7: Conversation CRUD (favorite, delete, copy, PDF) + sliding-window summarization** — favorite/rename/copy/PDF/Word/delete shipped via sidebar kebab menu 2026-05-24 (commits `05e9aff` + `83713c0`). Sliding-window summarization still not built.
- [x] **Week 7–8: In-chat thumbs/report** — shipped 2026-05-24 (commit `7cc36fa`). Red-team prompt tuning not started.
- [ ] **Week 8+: Open closed beta** — gated on the above.

### Chat implementation snapshot (commit `cc0402e`, 2026-05-23)

**Stack chosen**

- **AI SDK**: `ai@^6.0.191` + `@ai-sdk/anthropic@^3.0.79` + `@ai-sdk/react@^3.0.193`. Direct provider package (not the Vercel AI Gateway) — preserves the door for native Anthropic Citations API later without a hop.
- **Model**: `claude-sonnet-4-6` via `anthropic('claude-sonnet-4-6')`.
- **Retrieval**: direct Voyage REST API (no SDK). The `voyageai` SDK's ESM build has unresolvable directory imports that Turbopack rejects and that `serverExternalPackages` couldn't rescue. `lib/chat/retrieval.ts` hits `/v1/embeddings` and `/v1/rerank` directly with `fetch`.

**Architecture**

- `POST /api/chat` accepts `{ id, message }` (last-message-only transport via `prepareSendMessagesRequest`); loads prior `messages` rows; runs `streamText` with `stopWhen: stepCountIs(8)`; `consumeStream()` so persistence runs even if the client disconnects.
- Single tool `search_labor_code(query)` — calls `lib/chat/retrieval.ts` → Voyage `voyage-3` query embed → `match_chunks` RPC (top 20 candidates) → Voyage `rerank-2.5` (top 6) → returns chunks shaped for the model with short field names (`id, article, section, doc, primary, content`).
- System prompt (`lib/chat/system-prompt.ts`) hard-codes: persona, four-lane fallback, strict bracket-only cite format, and an explicit `[INFO]` token marker for the general-knowledge lane (replaces the original `ℹ️` prefix because it's easier to detect deterministically client-side).
- Persistence: AI SDK message IDs aren't uuids, so the route lets Postgres assign `messages.id` and persists only the suffix `messages.slice(priorCount)`. Tool chunks are deduped and written to `messages.citations` jsonb on the assistant row; tool parts also captured in `messages.tool_calls`. `conversations.updated_at` is bumped so the sidebar reorders.

**UI**

- `/chat` → generates a uuid and redirects to `/chat/[id]`. The conversation row isn't created in the DB until the first message arrives (the API upserts on POST).
- `/chat/[id]` server-loads conversation + messages + flattened citations and hands them to the `<Chat>` client component.
- `<Chat>` uses `useChat` with `id: conversationId, messages: initialMessages`; merges DB-loaded chunks with chunks streaming in from live tool parts into a single pool keyed by `chunk.id`.
- Inline citation badges render via `components/chat/answer-renderer.tsx` (regex tokenizer over the streamed text — partial brackets stay as plain text until the closing bracket arrives). Match is by normalized `article_ref` against the chunk pool, with a substring fallback. Unmatched brackets render as a dim non-interactive badge.
- Side panel is the shadcn `Sheet` (right-anchored, 420px). Doc reference + indigo article-ref headline + parent section + cited content with a gold left-border anchor.
- "Info générale, non sourcée" pill is rendered when the tokenizer sees the `[INFO]` token.
- `/` redirects signed-in users to `/chat`. `AppHeader` (non-chat pages) gained a Conversations link.

**Known deferred work in chat**

1. **Native Anthropic Citations API** — currently bracket-pattern (model emits `[Art. X.Y]`, system prompt instructs strict-only-from-tool-results, but no enforcement). The AI SDK v6 tool-result content-parts API doesn't expose Anthropic's `document` block with `citations.enabled`, so enforcement requires bypassing the tool abstraction (manual document injection on user turns), which conflicts with spec §7.2 multi-pass search. **Plan**: keep bracket pattern for closed beta; revisit with native enforcement once we have eval-set evidence of fabricated cites.
2. **Sliding-window summarization** (spec §7.4) — schema field `conversations.summary` exists but no summarizer job written.
3. **Conversation CRUD beyond list/create** — no favorite toggle, no delete, no rename, no copy-to-clipboard, no PDF download.
4. **Thumbs-up/down + report** — ~~schema and admin viewer exist; in-chat UI doesn't.~~ **Done 2026-05-24** (commit `7cc36fa`). Per-message 👍/👎/🚩 with comment dialog; server action `app/chat/feedback-actions.ts` resolves the target by `(conversationId, messageIndex)` because freshly-streamed assistant messages have AI-SDK ids that don't match the DB uuid, and retries briefly to cover the race between stream completion and the chat route's `onFinish` insert. Migration `0012` adds partial unique indexes on `(message_id, user_id) WHERE rating IN ('up','down')` and `WHERE rating='report'` so rating + report can coexist but only one of each per user. Admin filter pills (Tous/👍/👎/🚩) shipped same day (commit `706af93`); admin join fix `87519a6` fixed `f.profiles?.[0]` reading undefined on many-to-one embedded selects.
5. **Auto-resize textarea** on the input box — currently single-row textarea with shift+enter newline.

**Files touched in commit `cc0402e`**

- New: `app/api/chat/route.ts`, `app/chat/page.tsx`, `app/chat/layout.tsx`, `app/chat/[id]/page.tsx`, `components/chat/{chat,citation,answer-renderer,sidebar}.tsx`, `components/ui/sheet.tsx`, `lib/chat/{system-prompt,retrieval}.ts`.
- Modified: `app/page.tsx` (signed-in redirect to /chat), `components/app/app-header.tsx` (Conversations link), `package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` (AI SDK + Anthropic + React + zod deps; pnpm `minimumReleaseAgeExclude` entries for the v6 packages).

### Eval set — first tester findings (2026-05-24)

First beta tester (admin@kodit.ai) returned **11/50 questions filled** across all 5 categories. Verdicts: 9 OK, 2 MAUVAIS. Raw CSV archived at `eval/filled/admin-kodit-2026-05-24.csv`. The tester added a `commentary` column not in the template — keep it for future testers, it's more useful than the binary `friend_verdict` alone.

Three consistent patterns across both MAUVAIS rows and several OK-with-commentary rows:

**Pattern 1 — Laya jumps to legal verdicts without clarifying the case.**
- Q21 (printing shop, 7h work no break, MAUVAIS): declared "doublement illégal" and computed overtime — but assumed "demi-journée = 4h" when in CI it's traditional practice not legally fixed. Should have asked about contract hours first.
- Q23 (no potable water, MAUVAIS): recommended Inspection du Travail immediately. Tester's point: should have asked "what's the water source? If it's SODECI tap water, it IS potable" — no violation at all.

**Pattern 2 — Should always ask about contract type (CDI/CDD) for case-specific questions.**
- Q2 (préavis cadre): tester wanted CDI/CDD clarification before answer.
- Q42 (firing pregnant secretary): same answer is illegal advice for CDI, legal for CDD. Laya did eventually ask, but only after giving a generic answer first.

**Pattern 3 — What's working (don't regress).**
- Q11: synthesizing multiple articles instead of cherry-picking one. **Praised.**
- Q32 (stolen truck): asking "is this a work vehicle or personal?" before answering. **Praised.**
- Q41 (fake injury for money): refusing fraud + pivoting to legitimate compensation routes. **Praised.**
- Q22, Q31: asking targeted clarifying questions or honestly redirecting out-of-domain.

**Actions taken (2026-05-24, commit `f976063`):**

1. ✅ **System-prompt tuned** — `lib/chat/system-prompt.ts` got a new "Avant de donner un verdict juridique — clarifier le cas" section. Hard rule: distinguish factual questions (answer first, ask follow-up after) from individual-situation questions (clarify FIRST — contract type, ancienneté, category, exact facts, problem origin — before any legal verdict). CDI vs CDD called out as the most determinative factor. Inspection du Travail / mise en demeure / prud'hommes explicitly demoted to last-resort.
2. ✅ **Round-2 packet sent to tester** — `eval/round-2-CDI-CDD.md`, 5 targeted questions all designed to flip verdict based on CDI vs CDD (pregnant CDD end-of-term, anticipated rupture, prime de précarité, 2-year cumulative cap, tacit CDD continuation). Tester only needs to answer "did Laya ask the contract type before answering? yes/no/partial" per question — informal WhatsApp response, no spreadsheet needed.
3. ✅ **Runner hold-off documented** — `eval/README.md` codifies the ≥25-rows-from-2+-testers threshold.

**Round-2 results — returned 2026-05-24, PASSED 5/5.** Tester sent transcripts (`round-2-CDI-CDD answers.docx` on Hussein's Desktop). Per-question verdict:

| # | Question | CDI/CDD asked first? | Notes |
|---|---|---|---|
| 1 | Pregnant employee end-of-contract | ✅ | Also asked when pregnancy was disclosed |
| 2 | Resignation, 8 months left | ✅ | Also asked about cadre status |
| 3 | End-of-contract bonus | ✅ | Also asked ancienneté |
| 4 | 7 renewals of 3-month CDD | Correctly skipped (contract type implicit) | Synthesized [Art. 15.4] + [Art. 15.6] + [Art. 15.1] cleanly, ended with the pivotal question |
| 5 | Contract ended 2 weeks ago, still working | Correctly skipped (situation clear-cut) | Identified tacit CDI continuation, cited [Art. 7], asked the right follow-ups |

Calibration is right: clarifies on individual-situation questions, doesn't over-clarify when the question is factual or self-contained. The `f976063` prompt tune is validated.

**Still pending:**

- **Manual retest of Q21 + Q23 locally** — round-1 MAUVAIS rows, not covered by round-2. Q21 = printing shop "demi-journée 8-12h actually 7-14h no break"; Q23 = "patron makes us drink tap water". Open `/chat`, paste each verbatim, confirm Laya asks clarifying questions (contract type / hours / water source) BEFORE any "c'est illégal" verdict. If still failing, iterate on `lib/chat/system-prompt.ts` and retest.

### Open non-code actions (Hussein owns — see §12 for detail)

- [x] **Branding** (logo + wordmark + palette) — locked 2026-05-21, see `/branding/brand.md`
- [ ] **CinetPay KYC** application with ETS KODIT papers — start this week
- [ ] **Beta tester pipeline** — name 5–7 people across personas (salarié, RH, dirigeant, avocat, friends) by week 4
- [ ] **Avocat contact** for ToS review — start network outreach by week 2, engaged before Phase B ends
- [ ] **Domain registration** (`laya.ci` + `.com` backup) — by week 8, before public launch
- [ ] **Legal corpus expansion** (CCI 1977, sector conventions, jurisprudence) — ongoing post-launch

Update this list as items close. The list is the source of truth — when every box is checked, Phase B is unblocked.

### How to resume work in a new session

Read this file first, then `git log --oneline -20` for the latest commits. The chat is live at `/chat` (run `npx next dev` — `pnpm dev` may prompt to purge `node_modules` and hang on the non-TTY shell; if so, set `$env:CI="true"` first).

**Most likely next slice (in order of priority):**

1. **Manually retest Q21 + Q23 against the tuned prompt** — the two round-1 MAUVAIS rows. Q21 = printing shop "demi-journée 8-12h actually 7-14h no break", Q23 = "patron makes us drink tap water". Open `/chat`, paste each verbatim, look for clarification questions (contract type, hours, water source) BEFORE any verdict. Round-2 already validated CDI/CDD asking on 5 fresh scenarios — Q21/Q23 are the last gap in confidence before recruiting more testers.
2. **Sliding-window summarization** (spec §7.4) — schema exists, summarizer job doesn't.
3. **Recruit testers #2 and #3** for the eval set — the round-2 fix is validated, so the 11 round-1 rows are no longer the bottleneck; the next leverage is breadth (2+ testers, ≥25 filled rows) to unblock the runner.

The bracket→native-citations migration is non-urgent and deferred until eval data justifies the work.

**Vercel CLI is installed** (`vercel logs --follow`, `vercel env add KEY production`). Project linked to xkodit's Vercel account. Run `vercel link` again only if `.vercel/` is missing.

**Important env-var gotcha:** Vercel env vars are NOT pushed by `git push`. When you add a key to `.env.local`, also add it to Vercel via dashboard or `vercel env add NAME production` and **redeploy** (env changes don't propagate to existing deployments).

**Supabase migrations:** no CLI/Docker setup. Apply migrations by pasting SQL into Supabase Dashboard → SQL Editor, or use the Management API directly with `SUPABASE_ACCESS_TOKEN` (POST to `https://api.supabase.com/v1/projects/oyfxljzdjyebescnouvo/database/query` with `{"query": "..."}`).

---

## 1. Vision

**Laya** is an AI labor-law assistant for Côte d'Ivoire. Users ask questions about Ivorian labor law in natural language and receive grounded, source-cited answers backed by official documents (Code du Travail, décrets, conventions collectives, arrêtés). v1.1 adds generation of labor contracts and related legal documents.

The product targets a real gap: lawyer consultations cost 50,000–200,000 XOF, HR at small businesses have no advisor, and employees facing disputes have no accessible source of truth.

**Differentiators (what makes Laya credible, not just another chatbot):**
- **Audit-grade citations** via Anthropic's native Citations API — the model literally cannot fabricate a citation pointing to a span that wasn't in the source document.
- **Multi-pass agentic retrieval** — Laya reformulates and re-searches before giving up, so she feels like a librarian rather than a search box.
- **Tiered transparent fallback** — when the corpus doesn't have an answer, she says so honestly rather than hallucinating.
- **Adaptive persona** — warm, conversational, asks clarifying questions, mirrors the user's register.
- **Bilateral honesty** — serves both employees and employers, refuses help only for clearly illegal acts.

---

## 2. Target users

Role is collected at sign-up and drives the system prompt's tone calibration. The bot persona is constant; the depth and technical register adapt.

| Role | Response calibration |
|---|---|
| Salarié / Employé | Plain language, rights-focused, concrete next steps |
| Cadre / Manager | Balanced, both rights and responsibilities |
| RH / DRH | Procedural, compliance-focused, employer perspective |
| Dirigeant / Chef d'entreprise | Strategic, risk-aware, legal exposure framing |
| Avocat / Juriste | Technical, full citations, no oversimplification |
| Étudiant en droit | Educational, context and reasoning explained |
| Autre | Defaults to "Salarié" calibration |

**Note:** the per-conversation "employee vs HR" mode toggle from the v1 spec is removed. `user_type` is the single source of truth for response style.

---

## 3. Languages — phased multilingual rollout

| Version | Languages | Notes |
|---|---|---|
| v1.0 (Phase A) | **French only** | Corpus is French. Cuts prompt/QA burden in half for solo build. |
| v1.1 (Phase B) | French | Contract templates in French. |
| v1.2 | + English | Added after FR is stable in production. |
| v1.3+ / v2 | + Arabic (MSA) | RTL layout, MSA register (not dialect). Lebanese-diaspora consideration noted but bot speaks MSA. |
| Phase C (voice) | Per-language as each stabilizes | French voice first. |

**Architectural commitment for multilingual readiness:** `profiles.preferred_language`, `conversations.language` columns exist from day 1. System prompt is parameterized with `{language}`. UI uses a `next-intl`-ready structure even though only the FR bundle ships in v1.0. Adding a language later is a translation + system-prompt-tuning project, not a refactor.

---

## 4. v1.0 feature scope — Phase A (chat + RAG)

### 4.1 Authentication & profile

- **Signup method:** email + password (Supabase Auth)
- **Phase A signup is closed beta**: gated by `BETA_ALLOWLIST_EMAILS` env var. Unlisted emails see a "Laya est en bêta fermée" page with a request-access form.
- **Profile fields** (trimmed from v1):
  - Name (required)
  - Email (required, from auth)
  - User type / role (required)
  - Preferred language (defaults to `fr`, only `fr` accepted in v1.0)
  - Company (optional)
- **Cut from profile**: age, phone, location. Re-add only when a feature needs them.

### 4.2 Chat

- Text-only (no voice, no images — both deferred to Phase C / later)
- Streaming via Vercel AI SDK + `@ai-sdk/anthropic`
- **Tool-calling agent architecture** (see §7) — Laya chats freely, calls `search_labor_code(query)` when she needs facts, asks clarifying questions naturally
- **Anthropic Citations API** enforces citation fidelity — only spans actually present in the retrieved documents can be cited
- **Tiered fallback** when corpus misses (see §6.3) — never refuses outright if she can be useful in another lane

### 4.3 Conversation management

Per conversation:
- New, autosave, list, reopen, favorite, copy entire transcript to clipboard, **download as PDF**, delete
- **Cut from v1.0**: public share links (the `/share/[token]` viral mechanism). Add post-launch if real users ask. Copy-to-clipboard handles 90% of share intent.
- **Sliding-window summarization** for long conversations (§7.4): past ~20 turns get compacted into a `summary` field; live context is `summary + last 10 turns`. Caps token cost on power users.

### 4.4 Feedback

- Thumbs up / thumbs down on every assistant message
- "Report" button for inaccurate or harmful answers
- All feedback logged for system-prompt tuning and corpus gaps detection

### 4.5 Admin (Hussein only)

- Upload PDFs and Word docs to the corpus
- Mark each document as **primary source** (loi, décret, arrêté) or **secondary source** (handbook, doctrine, payroll guide). Only primary sources are cite-able via the Citations API; secondary sources can inform retrieval context but are never cited as authority.
- Document metadata: title, source type, reference (e.g., "Loi n° 2015-532"), effective date, `is_primary_source` flag
- Ingestion pipeline (see §8) runs as a local Python script on Hussein's laptop — not hosted
- Admin views: list documents, view status, reprocess, delete; list all users, conversations, feedback for moderation

### Cut from v1.0 (explicit)

- Voice chat (Phase C)
- Image upload / multimodal (Phase C or later)
- Reminders (deferred — likely never; not core to the product)
- Per-conversation response_mode toggle (redundant with `user_type`)
- Conversation share links (post-launch, if asked)
- English (v1.2)

---

## 5. v1.1 feature scope — Phase B (contracts)

Triggered once Phase A is stable in closed beta. This is the monetization hook.

- **Templates** (admin-uploaded `.docx`):
  - CDI, CDD, Contrat d'apprentissage, Contrat de stage
  - Lettre de licenciement, Lettre de démission
  - Mise en demeure, Solde de tout compte
  - + anything Hussein adds later
- **Guided form** collects variables (employee name, salary, dates, etc.) per template's variable schema
- **Legal validation rules** run before output:
  - Flag salaries below SMIG
  - Check for required clauses
  - Warn about non-compliant terms
- **Output**: PDF + Word, stored in user's profile, downloadable later

Phase B also brings:
- **CinetPay payment integration** (KYC submitted in parallel during Phase A — see §11)
- **Quota enforcement** with the tiered plans below
- **Upgrade modal** when free users hit limits

---

## 6. Conversation behavior — the part that makes Laya feel smart

### 6.1 Persona — "Laya"

- First-person: introduces herself as Laya. *"Salut, je suis Laya."*
- Warm but never gushy. Direct. No corporate hedging.
- Defaults to **vous** in French (correct register for legal/professional context).
- **Mirrors the user's register**: if the user writes "tu", she switches to "tu" in the same turn. If the user writes formally, she stays vous.
- Has opinions about what's **practical** ("franchement, dans ton cas je commencerais par…") but **never editorializes on what the law says** — law is reported only via citations.
- English (when shipped): same warmth, "you" register.

### 6.2 Conversation architecture — tool-calling agent

Laya runs as a normal chat agent with personality. She has one Phase A tool:

```ts
search_labor_code(query: string) → ChunkResult[]
```

- She chats freely, asks clarifying questions, banters in turn — **no citation required for free turns**.
- She calls `search_labor_code` when she needs a legal fact. The retrieval pipeline (§7) returns chunks; Anthropic Citations API enforces that any citation she emits points to a real span in those chunks.
- She **may call the tool up to 5 times per turn**, reformulating between calls. System prompt explicitly instructs: *"if your first search returns weak matches, reformulate and search again before falling back. Try at least 2 angles for any non-trivial question."*

### 6.3 Fallback policy — four lanes

When the corpus doesn't fully answer, Laya picks a lane explicitly and the UI labels it:

| Lane | When | Behavior | UI marker |
|---|---|---|---|
| **In-corpus legal claim** | Tool returned relevant primary-source chunks | Must cite. Citations API enforced. | Inline citation badges `[Art. L.16.7]` |
| **General-knowledge legal context** | Adjacent legal concept not in corpus (e.g., "what is CNPS?") | Answer from Claude's training, prefixed with marker | Amber "Info générale, non sourcée" badge |
| **Practical / procedural advice** | "How do I start this démarche?" | Answer freely, no badge (not a legal claim) | None |
| **Honest unknown** | Question requires a source Laya doesn't have (convention collective sectorielle, jurisprudence) | "Je n'ai pas cette source précise dans mes textes pour l'instant — pour [X], je te recommande de consulter un avocat." | None — plain text |

**Critical rule:** Laya must exhaust multi-pass search before dropping into general-knowledge or honest-unknown lanes. The fallback is a last resort, not a shortcut.

### 6.4 Misuse policy — bilateral honesty + soft refusal

Laya serves both salariés and dirigeants/RH. She answers what the law says regardless of who asks, but **adds counterparty context** to any answer that has one. *"La loi dit X [cit]. Attention : si tu fais ça, le salarié peut [Y]. Je te conseille [Z]."*

**Soft refusal for clearly illegal acts** — document falsification, antidating, covert discrimination, retaliation against protected categories. Pattern:

> "Antidater un contrat est un délit pénal — je ne peux pas t'aider à le faire. En revanche, voilà comment régulariser proprement…"

One sentence of refusal, never preachy, then pivot to a constructive lawful alternative.

**For ambiguous facts** — Laya asks a clarifying question before answering. The tool-calling agent does this naturally. *"Avant de répondre — est-ce que la salariée est enceinte ou en congé maternité ? Ça change la réponse."*

A "safety section" (8–12 lines) in the system prompt lists the soft-refuse categories explicitly. Red-team queries are part of the eval set (§10).

---

## 7. Technical architecture

### 7.1 Stack

| Layer | Choice |
|---|---|
| Frontend + API | Next.js 15+ (App Router) on Vercel |
| Auth + DB + Storage + Vector | Supabase (single project, pgvector extension) |
| AI orchestration | Vercel AI SDK + `@ai-sdk/anthropic` |
| Chat model | Anthropic Claude Sonnet (with native Citations API) |
| Embeddings | Voyage AI `voyage-3` (1024-dim) |
| Re-ranker | Voyage `rerank-2.5` |
| Ingestion script | Local Python (Hussein's laptop), writes directly to Supabase. Not hosted. |
| Payments | CinetPay (Phase B) |
| Email (transactional) | Resend or Supabase default (TBD in Phase A week 1) |

**Explicit non-choices:** no FastAPI, no Render, no separate backend service. Vercel + Supabase only. If Phase C's voice path genuinely needs bidirectional realtime, a single Python WS microservice gets added then — not before.

### 7.2 Retrieval stack (full agentic)

Built for a growing corpus from day 1, not optimized for 2 PDFs.

1. **Embedding**: question → Voyage `voyage-3` (input_type="query") → 1024-dim vector
2. **Hybrid search** in Postgres:
   - Vector similarity via pgvector HNSW index (`vector_cosine_ops`)
   - Full-text via `to_tsvector('french', content)` with GIN index
   - Combined via **Reciprocal Rank Fusion** → top 20 candidates
3. **Re-ranking**: Voyage `rerank-2.5` over the 20 candidates → keep top **6** for Claude
4. **Citations injection**: the 6 chunks go into the Anthropic `documents` block. Only chunks from `is_primary_source = true` docs are cite-able.
5. **Multi-pass**: Claude may invoke `search_labor_code` up to 5 times per turn with reformulated queries.

### 7.3 Chunking strategy

- **Article-aware** — splits on `Article L.X.Y`, `Art. X.`, etc. Long articles (>1500 chars) sub-split with 100-char overlap.
- **Chunk size target**: 200–1500 chars (Anthropic Citations API sweet spot)
- **Metadata per chunk**: `article_ref`, `parent_section`, `source_type`, `is_primary_source`, `effective_date`
- **Ingestion pipeline** (Python script):
  1. Parse (`pypdf`/`pdfplumber`; OCR fallback with Tesseract for scanned)
  2. Clean (whitespace, encoding)
  3. Article-aware chunk + sub-split
  4. Batch embed with Voyage `voyage-3` (input_type="document")
  5. Bulk insert into `document_chunks`
  6. Mark document `status='ready'`

### 7.4 Conversation memory

- **Across conversations**: NO cross-conversation history sharing. Profile context (name, user_type, company) is always in the system prompt — Laya knows *who* you are, not *what* you've discussed before. Cross-conversation user-memory deferred to v1.1+.
- **Inside a conversation**: full history up to ~20 turns. Past that, oldest turns get **summarized into `conversations.summary`** by a background job, and live context becomes `summary + last 10 turns`. Caps token cost at ~$0.20/turn on 100-turn conversations.
- **Trigger**: when message count crosses threshold, `POST /api/conversations/[id]/summarize` runs the summarization step.

### 7.5 Streaming pipeline

1. Client sends user message via Server Action or Route Handler
2. Server checks auth + quota
3. `streamText` from Vercel AI SDK invokes Claude with system prompt + history + tool definitions
4. Claude streams text and/or tool-call requests
5. When `search_labor_code` is called: backend runs §7.2 pipeline, returns chunks; chunks are injected into the next Claude turn as a `documents` block
6. Claude resumes with citations enforced
7. SSE stream pushes assistant tokens + citation metadata to the client
8. Frontend renders citation badges inline as tokens arrive

---

## 8. Database schema (v2)

All tables protected by Row Level Security. Users only see their own data. Admin role bypasses RLS for management tables.

```sql
-- PROFILES (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  user_type text not null,             -- 'salarie' | 'cadre' | 'rh' | 'dirigeant' | 'avocat' | 'etudiant' | 'autre'
  company text,                         -- optional
  preferred_language text default 'fr', -- 'fr' | 'en' | 'ar' (only 'fr' accepted in v1.0)
  role text default 'user',             -- 'user' | 'admin' (set from ADMIN_EMAILS env on signup/login)
  created_at timestamptz default now()
);
-- Cut from v1 spec: age, phone, location (re-add if a feature needs them)

-- SUBSCRIPTIONS & USAGE (built in Phase B but schema present from Phase A)
create table subscriptions (
  user_id uuid primary key references profiles(id) on delete cascade,
  plan text not null default 'free',    -- 'free' | 'pro' | 'business'
  status text not null default 'active',
  payment_provider text,                -- 'cinetpay'
  external_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

create table usage_events (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete cascade,
  event_type text not null,             -- 'chat_message' | 'contract_generated'
  input_tokens int default 0,
  output_tokens int default 0,
  cost_usd numeric(10,6),
  created_at timestamptz default now()
);
create index on usage_events(user_id, created_at desc);

-- CONVERSATIONS
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text,
  language text default 'fr',
  is_favorite boolean default false,
  summary text,                                -- compacted past-turns summary
  summary_through_message_id uuid,             -- pointer to where summary ends
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- Cut: response_mode (replaced by profiles.user_type)

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null,                          -- 'user' | 'assistant' | 'tool'
  content text not null,
  citations jsonb,                             -- Anthropic Citations API structured response:
                                                --   [{document_id, document_title, cited_text, start_char, end_char}]
  tool_calls jsonb,                            -- on assistant turns where search_labor_code was invoked
  input_tokens int,
  output_tokens int,
  created_at timestamptz default now()
);
create index on messages(conversation_id, created_at);

create table message_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  rating text not null,                        -- 'up' | 'down' | 'report'
  comment text,
  created_at timestamptz default now()
);

-- DOCUMENTS (legal corpus, admin-uploaded)
create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text,                            -- 'loi' | 'decret' | 'convention' | 'arrete' | 'handbook' | 'doctrine'
  source_authority text,                       -- 'primary' | 'secondary'
  is_primary_source boolean not null default false,
  reference text,                              -- e.g., 'Loi n° 2015-532'
  effective_date date,
  storage_path text not null,
  status text default 'processing',            -- 'processing' | 'ready' | 'failed'
  created_at timestamptz default now()
);

create extension if not exists vector;

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  article_ref text,
  parent_section text,
  chunk_index int,
  content text not null,
  embedding vector(1024),                      -- voyage-3 dimension
  created_at timestamptz default now()
);
create index on document_chunks using hnsw (embedding vector_cosine_ops);
create index on document_chunks using gin (to_tsvector('french', content));

-- CONTRACT TEMPLATES (Phase B; schema present from Phase A)
create table contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  variables jsonb not null,
  validation_rules jsonb,
  template_path text not null,
  created_at timestamptz default now()
);

create table generated_contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  template_id uuid references contract_templates(id) on delete set null,
  variables jsonb not null,
  output_pdf_path text,
  output_docx_path text,
  warnings jsonb,
  created_at timestamptz default now()
);
```

**Removed from v1 schema:**
- `conversations.response_mode`
- `conversation_shares` (share-link feature cut from v1.0)
- `reminders` (feature cut entirely)
- `profiles.age`, `profiles.phone`, `profiles.location`

**Citations column shape change:** v1 spec had `{document_id, article, chunk_id}`. v2 stores the structured Anthropic Citations API response: `{document_id, document_title, cited_text, start_char, end_char}`. UI maps `document_id + cited_text` → display label like `[Art. L.16.7]` at render time.

---

## 9. Business model

### Tiers (closed beta is all-free; pricing kicks in with Phase B launch)

| Plan | Price (XOF/mo) | Messages/mo | Contracts/mo |
|---|---|---|---|
| Free | 0 | 30 | 0 |
| Pro | ~5,000 | 300 | 5 |
| Business | ~25,000 | 3,000 | 50 |

Voice minutes are not a v1.x line item — voice arrives in v2. Pricing validated with market research before Phase B launch.

### Payment provider — CinetPay (locked)

- Aggregator covering Wave, Orange Money, MTN, Moov, Visa/Mastercard
- ~3–4% fees
- KYC submitted under ETS KODIT (CI legal entity) — **starts week 1 in parallel with coding**
- REST API, webhooks, recurring subscriptions
- Backup if CinetPay KYC stalls: PayDunya

### Flow

- User signs up → free tier
- Hits quota → upgrade modal
- Selects Pro / Business → CinetPay checkout
- Webhook updates `subscriptions` row, resets `usage_events` window

---

## 10. Quality gate — opening Phase A to beta testers

The eval set is the difference between "we shipped to testers when it felt ready" and "we shipped when we hit the bar."

### Eval set (50 questions, built in week 5–6 of Phase A)

| Category | Count | Purpose |
|---|---|---|
| Simple factual (one article, one citation) | 10 | Baseline retrieval + citation accuracy |
| Multi-hop (needs 2+ articles) | 10 | Multi-pass retrieval, synthesis |
| Clarification-required | 10 | Tool-calling agent asks before searching |
| Out-of-corpus (must use general/unknown lane) | 10 | Fallback policy honesty |
| Adversarial (misuse policy from §6.4) | 10 | Soft refusal + counterparty framing |

Each item records: expected behavior, expected citations if any, expected persona calibration, expected fallback lane.

**Runner**: Vitest + LLM-as-judge for soft criteria + exact-match for citations. Runs on every deploy. Pass-rate tracked in a dashboard.

**Bar to open closed beta**:
1. ≥80% pass-rate on the eval set
2. 5 hand-picked testers (1 salarié, 1 RH, 1 avocat, 2 friends) say *"yes I'd use this"* after spending 10 min each

### Who builds what

- Hussein writes the 50 Q&A pairs and expected behaviors (domain call, not code call)
- Claude scaffolds the runner, evaluator, and dashboard
- Templates provided when week 5 arrives

### Continuous tracking

From week 1 onward, both Hussein and Claude keep a running list of "interesting failure modes" observed during development. That list seeds the eval set when week 5 arrives.

---

## 11. Timeline (realistic at 3 hr/day)

The v1 spec assumed roughly full-time dev. Hussein is solo + self-funded, working ~3 hr/day (up to 5 some days). Honest timeline:

### Phase A (chat + RAG) — ~10–12 calendar weeks

| Weeks | Focus |
|---|---|
| 1–2 | Foundation: Next.js + Supabase + Tailwind + shadcn setup, schema migrations, RLS, auth, profile, allowlist middleware, admin route gate |
| 2–3 | Local Python ingestion script; ingest the 2 launch PDFs end-to-end; verify hybrid search returns sane results |
| 3–5 | Streaming chat with tool-calling agent; system prompt v1; Anthropic Citations API wiring; UI with citation badges |
| 5–6 | **Eval set construction (50 Q&A)** + runner; iterate on system prompt against the eval set |
| 6–7 | Conversation CRUD + autosave + reopen + favorite + delete + copy + PDF download; sliding-window summarization |
| 7–8 | Thumbs/report; admin moderation views; misuse-policy red-teaming; polish |
| 8–9 | Open closed beta to 5–10 testers; iterate on feedback |
| 9–10 | Stabilize; address bugs; expand beta to 15–20 testers |

Phase A "closed beta launch" = Phase A complete. No public launch yet.

### Phase B (contracts) — ~4–6 additional weeks

| Weeks | Focus |
|---|---|
| +1 | Contract template admin: upload, variable schema, validation rules |
| +2 | Variable collection form generator, template-filling engine |
| +3 | PDF + Word output; legal validation (SMIG floor, required clauses); storage |
| +4 | CinetPay integration (assumes KYC complete); quota enforcement; upgrade modal |
| +5–6 | Public launch prep: domain registration, ToS lawyer review, landing page, branding polish, beta expansion to public soft launch |

**Public launch target: ~month 4–5** from start of Phase A.

### Phase C (voice) — post-launch, only after paying users exist

STT + TTS + bidirectional realtime. Only built if and when paid revenue justifies it.

---

## 12. Non-code tracks running in parallel

Hussein owns these. Claude reads this section every time the spec is referenced and reminds Hussein of any unchecked items at the top of the response. Mark `[x]` when complete.

| Done | Track | Start | Deadline | Notes |
|---|---|---|---|---|
| [x] | **Branding** (logo, wordmark, palette) | 2026-05-21 | Before week 1 coding | Locked 2026-05-21. Indigo `#2F00B9`, gold `#E8BF3C`, Plus Jakarta Sans. See `/branding/brand.md`. |
| [ ] | **CinetPay KYC application** | Week 1 (2026-05-25) | Submitted before Phase B (week 11) | ETS KODIT papers ready |
| [ ] | **Beta tester pipeline** (5–7 names across personas) | Week 1 (ideating) | Filled by week 4 | Empty — needs outreach |
| [ ] | **Avocat for ToS review** | Week 2 (network outreach) | Engaged before Phase B end | No contact yet |
| [ ] | **Domain registration** (`laya.ci` + `.com` backup) | Week 8 | Active before public launch | Closed beta uses `*.vercel.app` until then |
| [ ] | **Legal corpus expansion** (CCI 1977, sector conventions, jurisprudence) | Ongoing | Continuous post-launch | 2 PDFs locked for launch; more to come |

**Convention:** when a box flips from `[ ]` to `[x]`, also update §0 at the top of the doc.

---

## 13. Closed beta + admin auth (operational)

- **Phase A is closed beta only.** Signup middleware checks email against `BETA_ALLOWLIST_EMAILS` env var. Unlisted emails see a request-access page (collects email + role + reason). Hussein curates the allowlist manually.
- **Admin auth**: `ADMIN_EMAILS` env var. Supabase auth callback sets `profiles.role = 'admin'` for matching emails on signup AND every login (env-change-safe, no DB surgery needed for promotions/demotions).
- **RLS**: standard `auth.uid()`-owned-rows policy for users + a `role = 'admin'` bypass policy for documents, document_chunks, contract_templates, message_feedback (moderation).
- **No abuse rate-limiting in Phase A** — closed beta means trusted users. Add Vercel-level rate limits if a beta tester misbehaves.
- **Quota enforcement code lives dormant in Phase A** (counting `usage_events` for analytics) but the soft-block kicks in only with Phase B.

---

## 14. Launch corpus

### Locked for v1.0

1. **Code du Travail — Loi n° 2015-532 du 20 juillet 2015** (primary, full law) — `is_primary_source = true`
2. **Décret n° 2024-898 relatif à la durée du travail** (primary, recent supplement) — `is_primary_source = true`

### Held for classification (post-launch ingestion)

Hussein has 7 additional PDFs (Grille Salariale 2023, Barème Salaire Catégoriel, Réforme ITS, Heures Supplémentaires, Les Retenues Sur Salaires, Les Secrets de la Paie 1, Doctrine CNPS). Each must be classified as primary or secondary before ingestion — most are likely commentary handbooks, which means they inform retrieval context but **must not be cited as authority**.

### Acquisition targets (gaps to fill before public launch ideally)

- Convention Collective Interprofessionnelle (CCI 1977)
- Sector conventions collectives (banking, BTP, commerce, hôtellerie, transport)
- Jurisprudence (Cour Suprême, chambre sociale)
- Décrets spécifiques (maternité, congés, sécurité sociale détaillée)

The bot's "honest unknown" fallback will fire often early on — that's correct behavior and builds trust.

---

## 15. UI direction

**Visual style**: clean, modern, in the family of Claude / ChatGPT / Grok chat UIs. Approachable, not corporate-bland.

**Key UI elements:**
- Minimalist sidebar with conversation list (favorites pinned)
- Main chat area with streaming message bubbles
- **Inline citation badges** (e.g., `[Art. L.16.7]`) — clickable to reveal source span in a side panel or modal
- **Lane markers** — amber "Info générale, non sourcée" badge on general-knowledge answers
- Top bar: conversation title, share-via-copy button, PDF download, settings
- Profile/settings accessible from sidebar
- Light and dark mode (Tailwind + shadcn defaults)
- Responsive: works on desktop and mobile browsers (native app deferred to v2)

**Brand**: Hussein delivers logo + palette today; design system seeds from there.

---

## 16. Success metrics for public launch (Phase B complete)

- 100+ signups in first month after public launch
- 25%+ activation (free users sending ≥3 messages)
- 5%+ conversion (free → paid)
- <2.5 second median time-to-first-token for chat
- 85%+ thumbs-up rate on answers
- **Zero fabricated citations** (spot-checked via the eval set and beta-tester reports)

---

## 17. Deferred to v2 or later (explicit non-scope)

- React Native mobile app (iOS + Android)
- Voice chat (Phase C)
- Image upload / multimodal
- Calculators as standalone tools (severance, notice, leave) — embedded in chat answers instead
- Reminders
- Public share links
- Cross-conversation user memory ("Laya remembers what you discussed last week")
- "Ask a real avocat" escalation feature
- Team accounts / company seats
- Custom document upload for Business tier
- Conversation translation within a single conversation
- API access for third parties
- Annual subscription pricing (monthly only at launch)

---

## Appendix A — Glossary

- **CDI** — Contrat à Durée Indéterminée (permanent contract)
- **CDD** — Contrat à Durée Déterminée (fixed-term contract)
- **SMIG** — Salaire Minimum Interprofessionnel Garanti (minimum wage)
- **CNPS** — Caisse Nationale de Prévoyance Sociale
- **CCI** — Convention Collective Interprofessionnelle (1977)
- **RAG** — Retrieval-Augmented Generation
- **RLS** — Row Level Security (Postgres)
- **RRF** — Reciprocal Rank Fusion (hybrid-search merge strategy)
- **STT / TTS** — Speech-to-Text / Text-to-Speech (Phase C only)
- **MSA** — Modern Standard Arabic (target Arabic register for v1.3+)

---

## Appendix B — Locked decisions (audit trail)

| # | Decision | Source |
|---|---|---|
| 1 | Spec is authoritative; v1 wishlist retired | 2026-05-21 grill, Q1 |
| 2 | Tool-calling agent architecture (not strict-prompt single-pass) | 2026-05-21 grill, Q2 |
| 3 | Persona = warm friend-with-expertise, vous default, mirrors user | 2026-05-21 grill, Q3 |
| 4 | Tiered transparent fallback policy (in-corpus / general / procedural / unknown) | 2026-05-21 grill, Q4 |
| 5 | Full agentic retrieval stack (multi-pass + hybrid + rerank + article-aware chunks + Citations API) | 2026-05-21 grill, Q5 |
| 6 | FR-only v1.0; EN v1.2; AR v1.3+; multilingual-ready architecture from day 1 | 2026-05-21 grill, Q6 |
| 7 | Phase A feature trim: kill response_mode toggle, trim profile, cut share links; keep PDF download | 2026-05-21 grill, Q7 + amendment |
| 8 | Conversation memory: per-conv + profile context + sliding summarization | 2026-05-21 grill, Q8 |
| 9 | Closed beta allowlist + env-driven admin role | 2026-05-21 grill, Q9 |
| 10 | Misuse policy: bilateral framing + soft refusal for illegal acts | 2026-05-21 grill, Q10 |
| 11 | Payment provider = CinetPay; KYC starts week 1 | 2026-05-21 grill, Q11 |
| 12 | Quality gate = 50-question eval set + 5-tester sign-off, built in week 5–6 | 2026-05-21 grill, Q12 |
| 13 | Stack = Next.js + Supabase only; no FastAPI/Render | 2026-05-16 grill (carried forward) |
| 14 | Citations via Anthropic native Citations API, Claude lock-in accepted | 2026-05-16 grill (carried forward) |
| 15 | Launch corpus = Code du Travail 2015-532 + Décret 2024-898; other 7 PDFs held | 2026-05-16 grill (carried forward) |

---

*End of specification v2. This is the contract — any future scope addition must be evaluated against this document.*
