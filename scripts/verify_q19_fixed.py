"""
Verify the Q19 fix: hybrid retrieval (match_chunks_hybrid, migration 0013)
+ cleaned Art. 15.10 chunk should now surface Art. 15.10 in the top
candidates for the queries Gemini reformulated on Q19.

Compare:
- match_chunks (vector-only, old RPC) — baseline
- match_chunks_hybrid (vector + FTS + RRF, new RPC) — fix
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client
from voyageai import Client as VoyageClient

QUERIES: list[str] = [
    "Si mon contrat CDD se termine mais que je continue à travailler après, il devient automatiquement un CDI ?",
    "requalification CDD en CDI après terme",
    "maintien en service après expiration CDD",
    "contrat à durée déterminée continuation au-delà du terme",
    "CDD requalification automatique CDI",
    "poursuite relation travail après terme CDD",
]

MATCH_COUNT = 20  # same as CANDIDATE_COUNT in retrieval.ts


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

    print(f"{'Query':70} | {'Vector-only':>12} | {'Hybrid':>10}")
    print("-" * 100)

    for q in QUERIES:
        emb = voyage.embed([q], model="voyage-3", input_type="query").embeddings[0]

        # Vector-only (old RPC)
        v_res = sb.rpc(
            "match_chunks",
            {
                "query_embedding": emb,
                "match_count": MATCH_COUNT,
                "filter_primary_only": False,
            },
        ).execute()
        v_rank = next(
            (i for i, row in enumerate(v_res.data, 1) if "15.10" in (row.get("article_ref") or "")),
            None,
        )

        # Hybrid (new RPC)
        h_res = sb.rpc(
            "match_chunks_hybrid",
            {
                "query_embedding": emb,
                "query_text": q,
                "match_count": MATCH_COUNT,
                "filter_primary_only": False,
            },
        ).execute()
        h_rank = next(
            (i for i, row in enumerate(h_res.data, 1) if "15.10" in (row.get("article_ref") or "")),
            None,
        )

        v_str = f"rank {v_rank}" if v_rank else "NOT in top 20"
        h_str = f"rank {h_rank}" if h_rank else "NOT in top 20"

        q_short = q if len(q) <= 70 else q[:67] + "…"
        print(f"{q_short:70} | {v_str:>12} | {h_str:>10}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
