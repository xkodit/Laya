import "server-only";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

// Sliding-window summarization (spec §7.4). Condenses the older turns of a
// conversation into a compact, specifics-preserving memory so per-turn input
// tokens stay bounded regardless of conversation length. Runs on the cheap
// branch (Gemini Flash) and only on the post-persist async path, so it never
// adds user-visible latency.
const SUMMARY_MODEL_ID = "gemini-2.5-flash";

const SUMMARY_SYSTEM = `Tu condenses une conversation entre un·e utilisateur·trice et Laya (assistante juridique en droit du travail ivoirien) en un résumé bref destiné à servir de MÉMOIRE INTERNE pour la suite de la conversation.

Règles :
- Préserve IMPÉRATIVEMENT les spécificités : chiffres, dates, montants, noms, type de contrat (CDI/CDD/stage/apprentissage), ancienneté, catégorie professionnelle, secteur d'activité, et tout article de loi déjà cité.
- Conserve les hypothèses déjà posées par Laya (ex. « on part du principe que c'est un CDD ») et les questions de clarification restées sans réponse.
- Style télégraphique. Pas de phrases creuses, pas de formules de politesse. ~500 tokens maximum.
- N'invente rien. Ne tire AUCUNE conclusion juridique nouvelle — tu ne fais que résumer ce qui a été dit.
- Écris à la 3e personne (« L'utilisateur·trice demande… », « Laya a expliqué… »).`;

export async function summarizeConversation(
  transcript: string,
): Promise<string | null> {
  try {
    const { text } = await generateText({
      model: google(SUMMARY_MODEL_ID),
      system: SUMMARY_SYSTEM,
      prompt: `Conversation à résumer :\n\n${transcript}\n\nRésumé :`,
      maxOutputTokens: 700,
    });
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    console.error("[chat] summarization failed", err);
    return null;
  }
}
