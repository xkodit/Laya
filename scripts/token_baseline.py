"""
Pull actual per-turn token stats from usage_events.

The cost optimization plan asserts 22,321 tokens/query as the current
average. Validate before we start cutting based on that number.
"""
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

    r = (
        sb.table("usage_events")
        .select("input_tokens, output_tokens, created_at")
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    rows = r.data or []
    if not rows:
        print("No usage_events rows yet — telemetry was added today (196fbe0).")
        return 0

    ins = sorted(r.get("input_tokens") or 0 for r in rows)
    outs = sorted(r.get("output_tokens") or 0 for r in rows)
    totals = sorted((a + b) for a, b in zip(ins, outs))

    def pct(arr, p):
        if not arr:
            return 0
        i = int(len(arr) * p / 100)
        i = min(i, len(arr) - 1)
        return arr[i]

    print(f"Sample: {len(rows)} turns (most recent 500)")
    print()
    print(f"{'metric':14} | {'min':>8} | {'p50':>8} | {'p90':>8} | {'p99':>8} | {'max':>8}")
    print("-" * 80)
    for label, arr in (("input_tk", ins), ("output_tk", outs), ("total_tk", totals)):
        print(
            f"{label:14} | "
            f"{arr[0]:>8} | {pct(arr,50):>8} | {pct(arr,90):>8} | "
            f"{pct(arr,99):>8} | {arr[-1]:>8}"
        )
    avg_in = sum(ins) / len(ins)
    avg_out = sum(outs) / len(outs)
    print()
    print(f"avg input_tk  = {avg_in:>8.0f}")
    print(f"avg output_tk = {avg_out:>8.0f}")
    print(f"avg total_tk  = {avg_in + avg_out:>8.0f}")
    print()
    print(f"Plan claim:     22,321 tk/query")
    print(f"Actual avg:     {avg_in + avg_out:.0f} tk/query")
    print(f"Ratio: actual is {(avg_in + avg_out) / 22321:.2f}× the plan's claim")
    return 0


if __name__ == "__main__":
    sys.exit(main())
