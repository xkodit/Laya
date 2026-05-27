"""
Apply a SQL migration via the Supabase Management API.

Usage:
    python scripts/apply_migration.py supabase/migrations/0013_match_chunks_hybrid.sql

The CLI/Docker setup isn't on this machine (per spec §0), so we use the
Management API directly. Needs SUPABASE_ACCESS_TOKEN in .env.local.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if len(sys.argv) != 2:
        print("usage: python scripts/apply_migration.py <path-to-.sql>")
        return 2

    sql_path = Path(sys.argv[1]).resolve()
    if not sql_path.exists():
        print(f"File not found: {sql_path}")
        return 1

    repo_root = Path(__file__).resolve().parent.parent
    load_dotenv(repo_root / ".env.local")

    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        print("SUPABASE_ACCESS_TOKEN not set in .env.local")
        return 1

    project_ref = "oyfxljzdjyebescnouvo"  # per spec §0

    sql = sql_path.read_text(encoding="utf-8")
    print(f"Applying {sql_path.name} ({len(sql)} chars)…")

    res = requests.post(
        f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"query": sql},
        timeout=30,
    )
    print(f"  HTTP {res.status_code}")
    print(f"  {res.text[:500]}")
    res.raise_for_status()
    return 0


if __name__ == "__main__":
    sys.exit(main())
