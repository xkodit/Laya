"""
Smoke test for the corpus retrieval path.

For each question:
  1. Embed with Voyage voyage-3 (input_type='query').
  2. Call the `match_chunks` Postgres RPC.
  3. Print the top 6 hits so we can eyeball relevance.

This is vector-only — no hybrid FTS, no rerank. Those layers come later
in the actual chat path.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client
from voyageai import Client as VoyageClient

QUESTIONS: list[str] = [
    "Combien d'heures dois-je travailler par semaine ?",
    "Puis-je être licencié pendant mon congé maladie ?",
    "Combien de jours de congés payés ai-je droit ?",
    "Quel est le délai de préavis en cas de démission ?",
    "Qu'est-ce que les heures supplémentaires ?",
]

TOP_K = 6


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    repo_root = Path(__file__).resolve().parent.parent
    load_dotenv(repo_root / ".env.local")

    sb = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SECRET_KEY"],
    )
    voyage = VoyageClient(api_key=os.environ["VOYAGE_API_KEY"])

    for q in QUESTIONS:
        print("=" * 80)
        print(f"Q: {q}")
        print("-" * 80)

        emb = voyage.embed([q], model="voyage-3", input_type="query").embeddings[0]
        resp = sb.rpc(
            "match_chunks",
            {"query_embedding": emb, "match_count": TOP_K, "filter_primary_only": False},
        ).execute()

        for i, row in enumerate(resp.data, 1):
            doc = row["document_reference"]
            art = row["article_ref"] or "—"
            parent = row["parent_section"] or "—"
            score = row["similarity"]
            preview = row["content"][:180].replace("\n", " ")
            print(f"  [{i}] {score:.3f}  {doc}  {art}  ({parent})")
            print(f"      {preview}…" if len(row["content"]) > 180 else f"      {preview}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
