import "server-only";

// Whole-conversation router. Picks a model per user turn based on the
// shape of the message. Premise (per session 2026-05-27 cheap-model
// experiments): the cheap branch holds discipline on short factual
// questions but degrades on long detailed individual-situation messages
// (Q21 M3-class). Sonnet 4.6 stays the validated baseline for those
// high-stakes turns.
//
// Cheap branch is currently Grok 4 Fast (swapped in from Gemini Flash
// 2.5 after Gemini hit a rule-count ceiling on Q4 standard-before-
// exception). Swap-friendly: only the model wiring in route.ts changes
// when the cheap branch is replaced; this router file stays the same.
//
// v1 is a deterministic regex/length classifier. No LLM call. Can swap
// to a model-based classifier later if false-positive/negative rates
// become problematic.

export type RouteDecision = "grok" | "sonnet";

// Adversarial / bilateral-honesty triggers — Sonnet's reframe behavior
// (spec §6.4) is hard to replicate cheaply. Catch discrimination,
// retaliation, soft-refusal scenarios regardless of message length.
const ADVERSARIAL_PATTERNS: RegExp[] = [
  /\benceinte\b|\bgrossesse\b|\bcong[ée]\s+maternit[ée]\b/i,
  /\b(antidat|falsif|cacher|dissimul)\w*/i,
  /\b(repr[ée]sailles?|retorsion|repr[ée]senter)\b/i,
  /\b(discrimin|harcel|harc[èe]l)\w*/i,
  /\b(ne\s+pas\s+(payer|d[ée]clarer)|non\s+d[ée]clar[ée])/i,
  /\b(licencier|virer|renvoyer)\s+(sans|pour)/i,
];

// Length threshold tuned on the Q21 M3 pattern: long detailed messages
// describing a concrete situation with numeric facts that require
// computation or multi-axis synthesis. Q21 M3 sits at exactly 180 chars;
// Q19 (the next-largest passing-on-Gemini axis) is 106 chars. 150 splits
// them cleanly.
const LENGTH_THRESHOLD = 150;

export function routeMessage(text: string): RouteDecision {
  const t = text.trim();

  // Long detailed messages → Sonnet (computation + multi-axis synthesis)
  if (t.length > LENGTH_THRESHOLD) return "sonnet";

  // Adversarial / discrimination axis → Sonnet regardless of length
  if (ADVERSARIAL_PATTERNS.some((r) => r.test(t))) return "sonnet";

  // Default: short general/factual → cheap branch (Grok)
  return "grok";
}
