"""
Q19 retrieval investigation (Hadi round-4 critique, 2026-05-27).

Hadi flagged: Art. 15.10 of Loi 2015-532 (requalification CDD → CDI when
work continues past the term) IS in the corpus, but search_labor_code
didn't surface it for the Q19 question — Laya fell back to [INFO] lane
honestly but lost the citation.

Diagnose:
  A. Is Art. 15.10 actually in document_chunks? What's the article_ref?
     What's the content?
  B. Do the queries Gemini reformulated retrieve it? At what rank?
  C. If not at rank 1-6, what surfaces above it?
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client
from voyageai import Client as VoyageClient

# The exact queries Gemini reformulated on Q19 (from the round-4 transcript)
QUERIES: list[str] = [
    "Si mon contrat CDD se termine mais que je continue à travailler après, il devient automatiquement un CDI ?",
    "requalification CDD en CDI après terme",
    "maintien en service après expiration CDD",
    "contrat à durée déterminée continuation au-delà du terme",
    # Sonnet's working phrasing (round-3 baseline retrieved it)
    "CDD requalification automatique CDI",
    "poursuite relation travail après terme CDD",
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

    # A. Direct lookup — is Art. 15.10 in document_chunks at all?
    print("=" * 80)
    print("A. Direct lookup: Art. 15.10 in document_chunks")
    print("=" * 80)
    resp = (
        sb.table("document_chunks")
        .select("id, article_ref, parent_section, content, document_id")
        .ilike("article_ref", "%15.10%")
        .execute()
    )
    if not resp.data:
        # Try other phrasings
        for ilike in ["%Art. 15.10%", "%Article 15.10%", "%15-10%"]:
            r = (
                sb.table("document_chunks")
                .select("id, article_ref, content")
                .ilike("article_ref", ilike)
                .execute()
            )
            print(f"  ilike '{ilike}': {len(r.data)} hits")

        # Fall back to content search
        r = (
            sb.table("document_chunks")
            .select("id, article_ref, content")
            .ilike("content", "%réputés être à durée indéterminée%")
            .execute()
        )
        print(f"  content match 'réputés être à durée indéterminée': {len(r.data)} hits")
        for row in r.data[:3]:
            print(f"    [{row['id'][:8]}] article_ref={row['article_ref']!r}")
            print(f"      {row['content'][:200]}…")
    else:
        print(f"  Found {len(resp.data)} chunk(s) with article_ref like '%15.10%'")
        for row in resp.data:
            print(f"    article_ref={row['article_ref']!r}")
            print(f"    parent_section={row['parent_section']!r}")
            print(f"    content (first 300 chars):")
            print(f"      {row['content'][:300]}…")
            print()

    # B. For each query, what does match_chunks return?
    print("\n" + "=" * 80)
    print("B. Vector retrieval for each query (top 6)")
    print("=" * 80)

    for q in QUERIES:
        print(f"\n--- Query: {q!r}")
        emb = voyage.embed([q], model="voyage-3", input_type="query").embeddings[0]
        r = sb.rpc(
            "match_chunks",
            {
                "query_embedding": emb,
                "match_count": TOP_K,
                "filter_primary_only": False,
            },
        ).execute()
        for i, row in enumerate(r.data, 1):
            art = row.get("article_ref") or "—"
            doc = row.get("document_reference") or row.get("document_title") or "?"
            score = row.get("similarity", 0)
            preview = row.get("content", "")[:120].replace("\n", " ")
            marker = " <<< Art. 15.10" if "15.10" in (art or "") else ""
            print(f"  [{i}] sim={score:.3f}  {doc}  {art}  {marker}")
            print(f"      {preview}")

    # C. Same queries but expanded top-K to 20 — is Art. 15.10 in candidate set
    # but getting filtered out by the small top_K=6?
    print("\n" + "=" * 80)
    print("C. Expanded candidate set (top 20) — does 15.10 surface deeper?")
    print("=" * 80)
    for q in QUERIES:
        emb = voyage.embed([q], model="voyage-3", input_type="query").embeddings[0]
        r = sb.rpc(
            "match_chunks",
            {
                "query_embedding": emb,
                "match_count": 20,
                "filter_primary_only": False,
            },
        ).execute()
        ranks_with_1510 = [
            (i, row.get("similarity"))
            for i, row in enumerate(r.data, 1)
            if "15.10" in (row.get("article_ref") or "")
        ]
        if ranks_with_1510:
            print(f"  {q!r}")
            for rank, sim in ranks_with_1510:
                print(f"    Art. 15.10 found at rank {rank} (sim={sim:.3f})")
        else:
            print(f"  {q!r}")
            print(f"    Art. 15.10 NOT in top 20")

    return 0


if __name__ == "__main__":
    sys.exit(main())
