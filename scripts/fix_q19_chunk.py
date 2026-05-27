"""
A. Re-ingest Art. 15.10 with clean content (Hadi round-4 Q19 critique).

The Art. 15.10 chunk currently has trailing CHAPITRE/SECTION headers
absorbed into its content, which dilutes the semantic embedding and
keeps the chunk out of vector top-20 for the obvious user queries.

Fix: truncate to just the article's own sentence, re-embed, update.
The literal text of Art. 15.10 (Loi 2015-532) is one sentence:

    "Les contrats de travail à durée déterminée qui ne satisfont pas
    aux exigences posées par le présent chapitre sont réputés être à
    durée indéterminée."
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client
from voyageai import Client as VoyageClient

CLEAN_CONTENT = (
    "Les contrats de travail à durée déterminée qui ne satisfont pas "
    "aux exigences posées par le présent chapitre sont réputés être à "
    "durée indéterminée."
)


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

    # Look up the chunk
    resp = (
        sb.table("document_chunks")
        .select("id, article_ref, content, document_id")
        .eq("article_ref", "Art. 15.10")
        .execute()
    )
    if not resp.data:
        print("No chunk found for article_ref='Art. 15.10' — abort")
        return 1
    if len(resp.data) > 1:
        print(f"Multiple chunks ({len(resp.data)}) for Art. 15.10 — abort, inspect manually")
        for r in resp.data:
            print(f"  id={r['id']}  content[:100]={r['content'][:100]!r}")
        return 1

    chunk = resp.data[0]
    print(f"Found chunk id={chunk['id']}")
    print(f"  document_id={chunk['document_id']}")
    print(f"  BEFORE content ({len(chunk['content'])} chars):")
    print(f"    {chunk['content'][:300]}…")
    print()
    print(f"  AFTER content ({len(CLEAN_CONTENT)} chars):")
    print(f"    {CLEAN_CONTENT}")
    print()

    # Re-embed with input_type="document" (matches ingest.py)
    print("Re-embedding with voyage-3 input_type=document…")
    emb = voyage.embed(
        [CLEAN_CONTENT], model="voyage-3", input_type="document"
    ).embeddings[0]
    print(f"  Got {len(emb)}-dim embedding")

    # Update content + embedding atomically
    update_resp = (
        sb.table("document_chunks")
        .update({"content": CLEAN_CONTENT, "embedding": emb})
        .eq("id", chunk["id"])
        .execute()
    )
    if not update_resp.data:
        print(f"Update returned no data — possible failure: {update_resp}")
        return 1

    print(f"✓ Chunk {chunk['id']} updated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
