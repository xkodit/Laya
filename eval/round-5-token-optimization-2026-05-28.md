# Round 5 — V&V of the token-optimization changes (post round-4)

**Status: PENDING HADI.** Fill each `**Hadi's verdict:**` slot with OK / BAD / OK-with-critique.

**Date:** 2026-05-28
**Subject:** validating a batch of cost / token-optimization changes layered on top of the round-4 routing architecture (Gemini Flash 2.5 + Sonnet 4.6 + citation validator-strip + corpus list in the prompt), which you validated on 2026-05-27.

Hi Hadi,

Since you signed off the routing architecture in round-4, I've implemented the token-optimization plan we designed in the 2026-05-27 night grill. Nothing about the routing, the citation discipline, or the corpus changed in spirit — these are efficiency changes. But several of them **alter model-facing behavior**, so they need your V&V before we open the closed beta to testers #2–5.

This packet is organized by change. Some axes reuse the round-4 questions (so we can compare directly against an already-validated baseline). For the axes that need a fresh transcript, the exact test query + the expected behavior are written out; Hussein will paste the live transcript under each before you read.

> **How to read this:** ⚙️ = pure infrastructure, no behavior change (FYI only). 🔬 = behavior-affecting, needs your verdict.

---

## Summary of what changed

| # | Change | File(s) | Needs V&V? |
|---|---|---|---|
| 1 | Multi-pass cap: `stepCountIs(8) → 4`, prompt "up to 5×" → "up to 3×" | `app/api/chat/route.ts`, `lib/chat/system-prompt.ts` | 🔬 |
| 2 | Retrieval depth: `TOP_K 6 → 3` | `lib/chat/retrieval.ts` | 🔬 (multi-article axes) |
| 3 | Greeting / acknowledgement interception (no model call) | `app/api/chat/route.ts` | 🔬 (UX) |
| 4 | Sliding-window summarization (replaces hard truncation) | `app/api/chat/route.ts`, `lib/chat/summarize.ts` | 🔬 (long conversations) |
| 5 | Semantic response cache (skip model on repeat general questions) | `lib/chat/cache.ts`, migration `0014` | 🔬 (correctness + privacy) |
| 6 | Gemini explicit context caching (static prompt cached server-side) | `lib/chat/gemini-cache.ts`, migration `0015` | 🔬 (static prompt becomes a cached turn) |

**Deployment note:** migrations `0014` (response cache) and `0015` (settings store) must be applied before this is live. Nothing here is on production yet.

---

## 1. 🔬 Multi-pass cap (`stepCountIs(8) → 4`, "up to 3 searches")

**What & why.** A turn could previously run up to 8 generation steps; now it's capped at 4 (≈ 3 tool calls + 1 synthesis). The prompt's "up to 5 searches per turn" became "up to 3". Post round-4 retrieval fixes, the model usually finds what it needs in **one** search (the Q19 retest made a single call), so 3 keeps reformulation headroom for hard/adversarial cases while cutting the worst-case input-token tail.

**What to check.** On a question that genuinely needs reformulation (an adversarial or multi-angle one), does Laya still reach a good answer within 3 searches, or does she now give up too early / fall back to `[INFO]` when the answer was findable?

**Test (reuse round-4 Q19 + one adversarial multi-search case):**

- Q19 — *"Si mon contrat CDD se termine mais que je continue à travailler après, il devient automatiquement un CDI ?"*
- One adversarial case of your choice from the §10 set (41–50).

**Transcript (Hussein to paste):**

> _[paste]_

**Hadi's verdict:**

---

## 2. 🔬 Retrieval depth `TOP_K 6 → 3`

**What & why.** Voyage `rerank-2.5` already promotes the strongest chunks to the top; positions 4–6 are usually diminishing-value tail. Dropping to 3 cuts ~half the tool-result tokens per search. **This is the change most likely to hurt multi-article synthesis** — if a good answer needs to stitch together 4+ articles, 3 chunks may starve it.

**What to check (multi-article axes specifically).** Does Laya still synthesize across the right articles, or does she now miss an article she used to cite?

**Tests (the multi-article axes — pull exact wording from `eval/` template):**

- **Q11** — multi-article synthesis question (the one you praised in the first pass for combining articles instead of cherry-picking).
- **Q17** — *"Un CDD peut être renouvelé plusieurs fois ou il y a une limite ?"* (needs Art. 15.4 + the 24-month cap + Art. 15.10 requalification).
- **Q19** — CDD continues after term (needs Art. 15.10).

**Transcripts (Hussein to paste):**

> _[paste Q11]_
>
> _[paste Q17]_
>
> _[paste Q19]_

**Hadi's verdict:**

---

## 3. 🔬 Greeting / acknowledgement interception

**What & why.** A turn that is **< 4 words** and contains a greeting (`bonjour`, `salut`, `bonsoir`, `coucou`, `hello`, `hey`) or an acknowledgement (`merci`, `ok`, `super`, `parfait`, `nickel`, `top`, `génial`) is answered with a **canned reply** (using the user's first name) and **no model call** — zero tokens. A real question like *"ok et le préavis ?"* (≥ 4 words) still goes to the model.

Canned replies:
- Greeting → *"Bonjour {prénom}, je suis Laya, votre assistante en droit du travail ivoirien. Posez-moi votre question — par exemple sur un contrat, un licenciement, des congés payés ou la durée du travail."*
- Acknowledgement → *"Avec plaisir, {prénom} ! Si vous avez une autre question sur le droit du travail ivoirien, je suis là."*

**What to check.** (a) Do the canned replies feel on-brand? (b) Any false positives — a short message that *should* have gone to the model but got the canned reply instead? (c) Any short legal question wrongly intercepted?

**Tests:** send `bonjour`, `merci`, `ok`, and then a deliberately short real question like `c'est quoi le smig` (3 words — note: this one is also a cache candidate, see §5) and `ok et le préavis ?`.

**Transcript (Hussein to paste):**

> _[paste]_

**Hadi's verdict:**

---

## 4. 🔬 Sliding-window summarization

**What & why.** Previously, only the last 6 messages were sent to the model and everything older was silently dropped. Now, once a conversation passes 6 messages, the older turns are **compacted into a rolling summary** (computed asynchronously by Gemini Flash after each turn, target ~500 tokens, specifics-preserving). The model sees `summary + last ~6 messages + new message`. The summary is injected as an internal, self-describing system note (see deviation note below).

**What to check.** In a long conversation (10+ turns):
- (a) Does the summary **preserve the specifics** — contract type (CDI/CDD), seniority, numbers, dates, sector, articles already cited?
- (b) Does Laya ever **quote or reference the summary** out loud ("as my summary says…")? She must not — it's internal memory.
- (c) Does she stay coherent across the window boundary (i.e., still "remembers" a fact stated 8 turns ago)?

**Test:** run a 10–12 message conversation that establishes facts early (e.g. "I'm on a CDD, started March 2024, in the BTP sector") then asks a question 8 turns later that depends on those facts.

**Transcript (Hussein to paste):**

> _[paste]_

**Hadi's verdict:**

---

## 5. 🔬 Semantic response cache

**What & why.** Repeated **general** questions (SMIG amount, legal weekly hours, etc.) are served from a cache instead of re-running the model + retrieval. Two layers: exact-match on a normalized key, then semantic (cosine ≥ **0.92**). On a hit, the stored answer + its citations are replayed; on a miss, the model runs and the answer is cached.

**Eligibility (privacy-critical).** Only cheap-branch (Gemini-routed) turns that have **no first-person markers** (`je/mon/ma/nous/notre/moi/…`) and **no digits** are cacheable. Anything personal or case-specific never touches the cache — both for correctness and so no user's situation leaks into another user's answer. The cache key also includes `user_type`, so role-specific framing isn't crossed between roles.

**What to check.**
- (a) **Correctness on replay:** ask a universal question twice (e.g. *"c'est quoi le SMIG"* then *"montant du SMIG"*). Second answer should be served from cache (look for `route=cache-exact` / `route=cache-semantic` in the logs) and must be **identical and still correct**, with working citation badges.
- (b) **No wrong collapse:** ask a *different* question that shares keywords (e.g. *"le SMIG est-il imposable ?"*) and confirm it is **not** served the SMIG-amount answer.
- (c) **Privacy:** confirm a personal phrasing (*"mon salaire est en dessous du SMIG, que faire ?"*) is **never** cached or served from cache (it routes to Sonnet anyway, and is first-person + has no digit… it has none, but it is first-person → excluded).

**Transcript (Hussein to paste):**

> _[paste]_

**Hadi's verdict:**

---

## 6. 🔬 Gemini explicit context caching

**What & why.** The ~3,500-token static system prompt was being re-sent on every Gemini turn (Gemini's *implicit* caching only kicks in at ≥4,096 tokens, so we got nothing for free). Now the static prompt is stored once in a Gemini **cached content** resource and referenced by id, cutting the per-turn input cost on ~80% of traffic.

**Behavior change to validate.** Because Gemini forbids setting both a request `systemInstruction` and a `cachedContent`, the static prompt is cached as a **leading conversation turn** (a cached user message + a "Compris." model ack) rather than as a system instruction. The per-user context + summary stay as the request's system instruction. **Net effect: the static rules are now a cached leading turn instead of a system instruction.** That *could* slightly change how strictly Gemini follows the citation-discipline / methodology rules.

**What to check.** Re-run the round-4 Gemini axes (Q4, Q9, Q17, Q23, Q40) and confirm **no regression** vs round-4 — same answer quality, same citation discipline, no new fabrication, no structural degradation beyond the already-accepted Q4 inversion.

**Transcripts (Hussein to paste):**

> _[paste Q4 / Q9 / Q17 / Q23 / Q40]_

**Hadi's verdict:**

---

## Deviations from the grill design (for the audit trail)

These are places where the implementation diverged from the literal 2026-05-27-night plan, for correctness reasons. None change the intent.

1. **Summary injected as a system block, not a `[Résumé:]` assistant message.** The grill said inject the summary as a synthetic assistant message. A leading assistant message violates Anthropic's "first message must be a user message" rule, so it's injected as a self-describing, **uncached system block** instead. Same goal (cached Sonnet prefix stays byte-identical; summary doesn't bloat it), no role-ordering risk.

2. **Response-cache invalidation keyed on document label + a prompt/model hash, not on chunk id.** The grill specified chunk-level invalidation. Two problems made that fragile: chunk ids are truncated to 8 chars in stored citations, and re-ingest changes chunk ids entirely. Instead:
   - Each cache entry records the **canonical doc labels** it cited; re-ingesting a document drops every entry that cited it (stable across re-ingest). This runs automatically from `scripts/ingest.py`.
   - Each entry records a **prompt/model fingerprint**; a prompt tune or cheap-model swap makes old entries stop matching (and they age out via the 30-day TTL). **This matters because we're actively iterating the prompt** — without it, a prompt fix could be masked by stale cached answers.
   - The admin endpoint `POST /api/admin/cache/invalidate-topic` (keyword) and the 30-day TTL remain as the manual + backstop layers.

3. **Gemini static prompt cached as a leading `contents` turn, not as `systemInstruction`** — see §6 above. Forced by the Gemini API constraint that `systemInstruction` and `cachedContent` can't coexist in a request.

---

## Known limitations to flag

1. **Greeting interception is rule-based**, not model-based — it can in principle mis-fire on an unusual 1–3 word message. Low stakes (the reply just invites the user to ask their question), but worth your eye on false positives.
2. **Cache hits and greeting replies are not logged to `usage_events`** (they consume ~no tokens). For Phase B, they should still count toward the per-user *message* quota even though they cost nothing — tracked as a follow-up, not blocking.
3. **`TOP_K=3` is the riskiest change** for answer completeness. If the multi-article axes (§2) regress, the fix is a one-line revert to a higher K.

---

Drop your verdicts under each `**Hadi's verdict:**` slot (or by WhatsApp). The two that matter most are **§2 (TOP_K=3 on multi-article)** and **§6 (Gemini context-cache behavior change)**.

Thanks!
