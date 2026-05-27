"""One-off: print document_reference + title for each corpus doc."""
from __future__ import annotations
import os, sys
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    repo_root = Path(__file__).resolve().parent.parent
    load_dotenv(repo_root / ".env.local")
    sb = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SECRET_KEY"],
    )
    r = sb.table("documents").select("title, reference, status").execute()
    for d in r.data:
        print(f"  status={d['status']:10} ref={d['reference']!r}")
        print(f"           title={d['title']!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
