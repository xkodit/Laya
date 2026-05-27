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

# Mirror of QUERY_ALIASES in lib/chat/retrieval.ts. Keep in sync.
QUERY_ALIASES = {
    "CDD": "CDD contrat à durée déterminée",
    "CDI": "CDI contrat à durée indéterminée",
    "SMIG": "SMIG salaire minimum interprofessionnel garanti",
    "CNPS": "CNPS Caisse Nationale de Prévoyance Sociale",
    "DGT": "DGT Direction Générale du Travail",
    "DRH": "DRH directeur·trice des ressources humaines",
    "CCI": "CCI convention collective interprofessionnelle",
    "RH": "RH ressources humaines",
}


def expand_query(q: str) -> str:
    import re

    out = q
    for abbr, full in QUERY_ALIASES.items():
        out = re.sub(rf"\b{abbr}\b", full, out, flags=re.IGNORECASE)
    return out


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

    print(f"{'Query':60} | {'Vec':>5} | {'Hybr':>5} | {'Hybr+exp':>8}")
    print("-" * 100)

    for q in QUERIES:
        # Vector-only (old RPC, original query)
        emb_raw = voyage.embed([q], model="voyage-3", input_type="query").embeddings[0]
        v_res = sb.rpc(
            "match_chunks",
            {
                "query_embedding": emb_raw,
                "match_count": MATCH_COUNT,
                "filter_primary_only": False,
            },
        ).execute()
        v_rank = next(
            (i for i, row in enumerate(v_res.data, 1) if "15.10" in (row.get("article_ref") or "")),
            None,
        )

        # Hybrid (new RPC, original query)
        h_res = sb.rpc(
            "match_chunks_hybrid",
            {
                "query_embedding": emb_raw,
                "query_text": q,
                "match_count": MATCH_COUNT,
                "filter_primary_only": False,
            },
        ).execute()
        h_rank = next(
            (i for i, row in enumerate(h_res.data, 1) if "15.10" in (row.get("article_ref") or "")),
            None,
        )

        # Hybrid + expansion (new RPC, expanded query)
        expanded = expand_query(q)
        emb_exp = voyage.embed([expanded], model="voyage-3", input_type="query").embeddings[0]
        he_res = sb.rpc(
            "match_chunks_hybrid",
            {
                "query_embedding": emb_exp,
                "query_text": expanded,
                "match_count": MATCH_COUNT,
                "filter_primary_only": False,
            },
        ).execute()
        he_rank = next(
            (i for i, row in enumerate(he_res.data, 1) if "15.10" in (row.get("article_ref") or "")),
            None,
        )

        v_str = str(v_rank) if v_rank else "—"
        h_str = str(h_rank) if h_rank else "—"
        he_str = str(he_rank) if he_rank else "—"

        q_short = q if len(q) <= 60 else q[:57] + "…"
        print(f"{q_short:60} | {v_str:>5} | {h_str:>5} | {he_str:>8}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
