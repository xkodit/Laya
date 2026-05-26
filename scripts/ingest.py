"""
Ingest a French legal PDF into Laya's Supabase corpus.

Two modes:

  Single-PDF mode (manual, used by Hussein for the initial corpus):
    python scripts/ingest.py \
      --pdf "C:/path/to/code_du_travail.pdf" \
      --title "Code du Travail — Loi n° 2015-532" \
      --reference "Loi n° 2015-532" \
      --source-type loi \
      --source-authority primary \
      --primary-source \
      --effective-date 2015-07-20

  Pending-queue mode (drains admin uploads from the web UI):
    python scripts/ingest.py --from-pending

In pending mode the script queries `documents WHERE status='pending'`, downloads
each PDF from the `corpus` Storage bucket, parses + embeds + inserts chunks,
then flips status to 'ready' (or 'failed' on error). Metadata was already set
by the admin upload — the script just does the heavy lifting.

Behaviour (single-PDF mode):
  1. Uploads the PDF to the `corpus` Storage bucket (key = slug of reference).
  2. Inserts a row into `documents` with status='processing'.
  3. Extracts text with pdfplumber, walks line-by-line tracking
     Livre/Titre/Chapitre/Section, splits at Article boundaries.
  4. Sub-chunks long articles (>1500 chars) by paragraph, merges tiny ones.
  5. Embeds all chunks with Voyage `voyage-3` (1024-dim) in batches of 128.
  6. Bulk-inserts into `document_chunks`, then flips document status to 'ready'.
  7. Re-runs with the same --reference overwrite previous ingestion of that doc.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

import base64
import tempfile

import pdfplumber
from anthropic import Anthropic
from dotenv import load_dotenv
from supabase import Client, create_client
from tqdm import tqdm
from voyageai import Client as VoyageClient

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Voyage voyage-3 produces 1024-dim embeddings (matches schema vector(1024)).
EMBED_MODEL = "voyage-3"
EMBED_DIM = 1024
EMBED_BATCH = 128

# Spec §7.3 — chunks 200-1500 chars, article-aware.
MIN_CHUNK_CHARS = 200
MAX_CHUNK_CHARS = 1500

# ---------------------------------------------------------------------------
# Structure detection (French legal text)
# ---------------------------------------------------------------------------

# Hierarchy markers, in order of nesting depth (broadest first).
HIERARCHY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("livre", re.compile(r"^LIVRE\s+[IVXLCDM]+\b.*$", re.IGNORECASE)),
    ("titre", re.compile(r"^TITRE\s+[IVXLCDM]+\b.*$", re.IGNORECASE)),
    ("chapitre", re.compile(r"^CHAPITRE\s+[IVXLCDM]+\b.*$", re.IGNORECASE)),
    ("section", re.compile(r"^SECTION\s+(?:\d+|[IVXLCDM]+)\b.*$", re.IGNORECASE)),
]

# Article heading. Matches "Article 12", "Article 12.7", "Art. 12",
# "Article L.16-7", "Article L 16.7", etc.
ARTICLE_RE = re.compile(
    r"^(?:Article|Art\.?)\s+"           # marker
    r"(L\.?\s*)?"                       # optional L. prefix
    r"(\d+(?:[.\-]\d+)*)"               # number with optional .sub or -sub
    r"\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class Chunk:
    article_ref: str | None
    parent_section: str | None
    chunk_index: int
    content: str
    embedding: list[float] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "document"


def extract_text(pdf_path: Path) -> str:
    """Extract all text from PDF with pdfplumber, page-by-page."""
    pages: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in tqdm(pdf.pages, desc="Parsing PDF", unit="page"):
            text = page.extract_text() or ""
            pages.append(text)
    return "\n".join(pages)


# Claude Sonnet 4.6 is vision-capable, accepts PDF documents natively (server
# rasterizes), and balances quality/cost well for OCR-style transcription.
OCR_MODEL = "claude-sonnet-4-6"
OCR_PROMPT = (
    "Tu es un OCR pour documents juridiques français.\n\n"
    "Transcris ce document mot pour mot, en préservant fidèlement :\n"
    "- les en-têtes hiérarchiques (TITRE I, CHAPITRE II, SECTION 1, etc.)\n"
    "- les numéros d'articles (Article 5, Art. 12.3, etc.) sur leur propre ligne\n"
    "- la ponctuation et les paragraphes\n\n"
    "N'ajoute aucun commentaire, aucune introduction. Sortie : uniquement le texte transcrit."
)


def extract_text_via_vision(pdf_path: Path) -> str:
    """Send the entire PDF to Claude for transcription. Used for scanned PDFs
    where pdfplumber returns nothing.

    Result is cached in scripts/cache/<stem>.ocr.txt so re-runs (e.g. while
    tuning chunking) don't pay for OCR again. Delete the cache file to force.
    """
    cache_dir = Path(__file__).parent / "cache"
    cache_dir.mkdir(exist_ok=True)
    cache_path = cache_dir / f"{pdf_path.stem}.ocr.txt"
    if cache_path.exists():
        print(f"Using cached OCR: {cache_path.name}")
        return cache_path.read_text(encoding="utf-8")

    client = Anthropic()
    with pdf_path.open("rb") as f:
        pdf_b64 = base64.standard_b64encode(f.read()).decode("ascii")

    print("Transcribing via Claude vision…")
    msg = client.messages.create(
        model=OCR_MODEL,
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": pdf_b64,
                        },
                    },
                    {"type": "text", "text": OCR_PROMPT},
                ],
            }
        ],
    )
    parts = [b.text for b in msg.content if getattr(b, "type", None) == "text"]
    text = "\n".join(parts)
    print(
        f"  → {msg.usage.input_tokens} input + {msg.usage.output_tokens} output tokens"
    )
    cache_path.write_text(text, encoding="utf-8")
    return text


# Recurring page-header/footer noise injected by this PDF on every page.
# Stripped at normalize time so it doesn't pollute chunks or section labels.
NOISE_PATTERNS = [
    re.compile(r"POUR\s+REVENIR\s+A\s+LA\s+TABLE\s+DES\s+MATIERES,?\s+CLIQUEZ\s+ICI", re.IGNORECASE),
]


# TOC entries always end in dot-leaders + page number, e.g.:
#   "TITRE PREMIER : DISPOSITIONS GENERALES ........... 429"
# We drop these so the TOC's titre/chapitre headings don't poison the
# hierarchy stack with the wrong "current" section.
TOC_LINE_RE = re.compile(r"\.{4,}")


def normalize_whitespace(text: str) -> str:
    """Collapse runs of spaces, drop recurring header/footer noise, keep
    newlines so heading detection works."""
    out_lines: list[str] = []
    for ln in text.splitlines():
        ln = re.sub(r"[ \t]+", " ", ln).strip()
        # Strip markdown-bold/italic delimiters that Claude vision emits
        # around headings (e.g. "**Article 1 :**" → "Article 1 :"). Done
        # before regex matching so heading detection still works.
        ln = re.sub(r"\*\*([^*]+)\*\*", r"\1", ln)
        ln = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"\1", ln)
        ln = ln.strip()
        if not ln:
            continue
        # Drop noise patterns inline. After stripping, the line may become
        # empty (pure noise) — skip it.
        for pat in NOISE_PATTERNS:
            ln = pat.sub("", ln).strip()
        # Drop bare page-number lines (e.g. just "510" or "510 ").
        if re.fullmatch(r"\d{1,4}", ln):
            continue
        # Drop Table-of-Contents lines.
        if TOC_LINE_RE.search(ln):
            continue
        if not ln:
            continue
        out_lines.append(ln)
    return "\n".join(out_lines)


def clean_section_label(label: str) -> str:
    """Strip trailing page numbers and stray punctuation from a heading line."""
    label = re.sub(r"\s+\d{1,4}\s*$", "", label).strip()
    return label.rstrip(":").strip(" -—")


def parent_section_label(hierarchy: dict[str, str | None]) -> str | None:
    parts = [hierarchy[level] for level in ("livre", "titre", "chapitre", "section")]
    parts = [p for p in parts if p]
    return " › ".join(parts) if parts else None


def iter_articles(text: str) -> Iterator[tuple[str | None, str | None, str]]:
    """
    Walk normalized text and yield (article_ref, parent_section, body) tuples.

    Article boundaries are detected by ARTICLE_RE. Hierarchy is maintained as
    a running stack — when a higher-level header appears, deeper levels reset.
    """
    hierarchy: dict[str, str | None] = {k: None for k, _ in HIERARCHY_PATTERNS}
    levels = [k for k, _ in HIERARCHY_PATTERNS]

    current_article: str | None = None
    current_section: str | None = None
    current_body: list[str] = []

    def flush() -> Iterator[tuple[str | None, str | None, str]]:
        if current_body:
            body = " ".join(current_body).strip()
            if body:
                yield current_article, current_section, body

    for line in text.split("\n"):
        # Hierarchy markers
        matched_hierarchy = False
        for idx, (level, pat) in enumerate(HIERARCHY_PATTERNS):
            if pat.match(line):
                # Skip TOC-style hierarchy entries — they end in a page number
                # (sometimes with dot-leaders, sometimes just whitespace).
                # Body-text hierarchy headings don't carry a trailing number.
                if re.search(r"\s\d{1,4}\s*$", line):
                    matched_hierarchy = True
                    break
                # Reset deeper levels.
                hierarchy[level] = clean_section_label(line)
                for deeper in levels[idx + 1 :]:
                    hierarchy[deeper] = None
                matched_hierarchy = True
                break
        if matched_hierarchy:
            continue

        # Article heading
        m = ARTICLE_RE.match(line)
        if m:
            yield from flush()
            current_body = []
            # Normalize: strip the leading marker for cleaner article_ref.
            raw = m.group(0)
            num_part = raw.split(None, 1)[-1] if " " in raw else raw
            current_article = f"Art. {num_part}".replace("  ", " ").strip()
            current_section = parent_section_label(hierarchy)
            # Keep the rest of the line (after the heading) as content.
            tail = line[m.end():].strip()
            if tail:
                current_body.append(tail)
            continue

        # Regular body line
        current_body.append(line)

    yield from flush()


def split_long_text(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """Greedy split by paragraph then by sentence, never exceeding max_chars."""
    if len(text) <= max_chars:
        return [text]

    # Paragraphs (any double-space-ish boundary). The text has been newline-
    # normalized so we fall back to splitting on sentence boundaries.
    pieces = re.split(r"(?<=[.!?])\s+(?=[A-ZÀ-Ý])", text)
    out: list[str] = []
    buf = ""
    for piece in pieces:
        if not buf:
            buf = piece
            continue
        if len(buf) + 1 + len(piece) <= max_chars:
            buf = f"{buf} {piece}"
        else:
            out.append(buf)
            buf = piece
    if buf:
        out.append(buf)
    # If a single sentence is itself > max_chars, hard-wrap.
    final: list[str] = []
    for p in out:
        if len(p) <= max_chars:
            final.append(p)
        else:
            for i in range(0, len(p), max_chars):
                final.append(p[i : i + max_chars])
    return final


def build_chunks(articles: list[tuple[str | None, str | None, str]]) -> list[Chunk]:
    """Spec §7.3 — split articles >MAX_CHUNK_CHARS, keep small ones intact.

    We deliberately do NOT merge sub-MIN_CHUNK_CHARS articles together: the
    Citations API needs each chunk's article_ref to actually point to its
    own content, and merging would break that invariant. A small chunk is
    fine; a mis-attributed citation is not.
    """
    chunks: list[Chunk] = []
    counters: dict[str | None, int] = {}

    for article_ref, parent, body in articles:
        # Drop chunks that have no article anchor — they're TOC / preface
        # noise the bot can't cite anyway.
        if not article_ref:
            continue
        for part in split_long_text(body):
            idx = counters.get(article_ref, 0)
            chunks.append(
                Chunk(
                    article_ref=article_ref,
                    parent_section=parent,
                    chunk_index=idx,
                    content=part,
                )
            )
            counters[article_ref] = idx + 1

    return chunks


# ---------------------------------------------------------------------------
# Supabase + Voyage I/O
# ---------------------------------------------------------------------------


def get_supabase() -> Client:
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SECRET_KEY"]
    return create_client(url, key)


def upload_pdf(supabase: Client, pdf_path: Path, key: str) -> str:
    """Upload PDF to `corpus` bucket, return the storage path."""
    with pdf_path.open("rb") as f:
        data = f.read()
    # Upsert so re-runs replace the file.
    supabase.storage.from_("corpus").upload(
        key,
        data,
        {"content-type": "application/pdf", "upsert": "true"},
    )
    return key


def embed_chunks(chunks: list[Chunk]) -> None:
    """Fill in chunks[*].embedding using Voyage voyage-3 in batches."""
    client = VoyageClient(api_key=os.environ["VOYAGE_API_KEY"])
    for start in tqdm(range(0, len(chunks), EMBED_BATCH), desc="Embedding"):
        batch = chunks[start : start + EMBED_BATCH]
        result = client.embed(
            texts=[c.content for c in batch],
            model=EMBED_MODEL,
            input_type="document",
        )
        for chunk, embedding in zip(batch, result.embeddings):
            if len(embedding) != EMBED_DIM:
                raise RuntimeError(
                    f"voyage-3 returned {len(embedding)}-dim embedding, "
                    f"expected {EMBED_DIM}"
                )
            chunk.embedding = embedding


def upsert_document(
    supabase: Client,
    *,
    title: str,
    reference: str,
    source_type: str,
    source_authority: str,
    is_primary_source: bool,
    effective_date: str | None,
    storage_path: str,
) -> str:
    """Find by reference or insert new. Returns document id."""
    existing = (
        supabase.table("documents")
        .select("id")
        .eq("reference", reference)
        .limit(1)
        .execute()
    )
    if existing.data:
        doc_id = existing.data[0]["id"]
        # Drop old chunks so re-ingest is clean.
        supabase.table("document_chunks").delete().eq("document_id", doc_id).execute()
        supabase.table("documents").update(
            {
                "title": title,
                "source_type": source_type,
                "source_authority": source_authority,
                "is_primary_source": is_primary_source,
                "effective_date": effective_date,
                "storage_path": storage_path,
                "status": "processing",
            }
        ).eq("id", doc_id).execute()
        return doc_id

    inserted = (
        supabase.table("documents")
        .insert(
            {
                "title": title,
                "reference": reference,
                "source_type": source_type,
                "source_authority": source_authority,
                "is_primary_source": is_primary_source,
                "effective_date": effective_date,
                "storage_path": storage_path,
                "status": "processing",
            }
        )
        .execute()
    )
    return inserted.data[0]["id"]


def insert_chunks(supabase: Client, document_id: str, chunks: list[Chunk]) -> None:
    rows = [
        {
            "document_id": document_id,
            "article_ref": c.article_ref,
            "parent_section": c.parent_section,
            "chunk_index": c.chunk_index,
            "content": c.content,
            "embedding": c.embedding,
        }
        for c in chunks
    ]
    # Insert in batches to stay well under any payload caps.
    BATCH = 50
    for start in tqdm(range(0, len(rows), BATCH), desc="Writing chunks"):
        supabase.table("document_chunks").insert(rows[start : start + BATCH]).execute()


def mark_ready(supabase: Client, document_id: str) -> None:
    supabase.table("documents").update({"status": "ready"}).eq("id", document_id).execute()


def mark_failed(supabase: Client, document_id: str) -> None:
    supabase.table("documents").update({"status": "failed"}).eq("id", document_id).execute()


def mark_processing(supabase: Client, document_id: str) -> None:
    supabase.table("documents").update({"status": "processing"}).eq("id", document_id).execute()


def download_from_storage(supabase: Client, storage_path: str) -> Path:
    """Pull a corpus PDF down to a temp file and return the local path."""
    data = supabase.storage.from_("corpus").download(storage_path)
    tmp = tempfile.NamedTemporaryFile(
        prefix="laya-ingest-",
        suffix=Path(storage_path).suffix or ".pdf",
        delete=False,
    )
    try:
        tmp.write(data)
    finally:
        tmp.close()
    return Path(tmp.name)


def process_one_pending(supabase: Client, doc: dict) -> bool:
    """Parse, embed, and insert chunks for a single pending document row.
    Returns True on success, False on failure (and marks the row 'failed')."""

    doc_id = doc["id"]
    title = doc["title"]
    storage_path = doc["storage_path"]

    print(f"\n→ {title}  ({doc.get('reference') or doc_id})")
    print(f"  storage: corpus/{storage_path}")

    mark_processing(supabase, doc_id)

    local_path: Path | None = None
    try:
        local_path = download_from_storage(supabase, storage_path)
        print(f"  downloaded → {local_path}")

        raw = extract_text(local_path)
        text = normalize_whitespace(raw)
        print(f"  → {len(text):,} characters after normalization")

        # Scanned PDF: pdfplumber found no extractable text. Fall back to
        # Claude vision OCR — same path the single-PDF mode uses via --ocr.
        if not text.strip():
            print("  → no extractable text; falling back to Claude vision OCR…")
            raw = extract_text_via_vision(local_path)
            text = normalize_whitespace(raw)
            print(f"  → {len(text):,} characters after OCR + normalization")

        articles = list(iter_articles(text))
        chunks = build_chunks(articles)
        print(
            f"  → {len(articles)} article segments → {len(chunks)} chunks"
        )

        if not chunks:
            raise RuntimeError("no chunks produced")

        # Wipe any existing chunks (handles re-process via admin UI).
        supabase.table("document_chunks").delete().eq(
            "document_id", doc_id
        ).execute()

        embed_chunks(chunks)
        insert_chunks(supabase, doc_id, chunks)
        mark_ready(supabase, doc_id)
        print(f"  ✓ ready ({len(chunks)} chunks)")
        return True

    except Exception as exc:
        mark_failed(supabase, doc_id)
        print(f"  ✗ failed: {exc}", file=sys.stderr)
        return False

    finally:
        if local_path and local_path.exists():
            try:
                local_path.unlink()
            except OSError:
                pass


def process_pending_queue(supabase: Client) -> int:
    """Drain all documents WHERE status='pending'. Returns process exit code."""
    pending = (
        supabase.table("documents")
        .select("id, title, reference, storage_path")
        .eq("status", "pending")
        .order("created_at", desc=False)
        .execute()
    )
    docs = pending.data or []

    if not docs:
        print("No documents with status='pending'. Nothing to do.")
        return 0

    print(f"Found {len(docs)} pending document(s).")

    succeeded = 0
    failed = 0
    for doc in docs:
        if process_one_pending(supabase, doc):
            succeeded += 1
        else:
            failed += 1

    print(f"\nDone. {succeeded} ready, {failed} failed.")
    return 0 if failed == 0 else 1


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Ingest a legal PDF into Laya's corpus.")
    p.add_argument(
        "--from-pending",
        action="store_true",
        help="Drain the queue of documents WHERE status='pending' (admin uploads). "
        "All metadata flags below are ignored in this mode.",
    )
    p.add_argument("--pdf", type=Path, help="Path to the PDF file (single-PDF mode).")
    p.add_argument("--title", help="Human title shown in citations.")
    p.add_argument("--reference", help="Canonical reference (e.g. 'Loi n° 2015-532'). Used as upsert key.")
    p.add_argument(
        "--source-type",
        choices=["loi", "decret", "convention", "arrete", "handbook", "doctrine"],
    )
    p.add_argument("--source-authority", choices=["primary", "secondary"])
    p.add_argument(
        "--primary-source",
        action="store_true",
        help="Set documents.is_primary_source = true (chunks become citable as authority).",
    )
    p.add_argument("--effective-date", help="ISO date YYYY-MM-DD, optional.")
    p.add_argument(
        "--stop-at",
        help="Regex pattern. Truncate the extracted text at the first body-line "
        "match. Use to cut a PDF where multiple documents are glued together "
        "(e.g. --stop-at='CONVENTION COLLECTIVE INTERPROFESSIONNELLE').",
    )
    p.add_argument(
        "--ocr",
        action="store_true",
        help="Transcribe via Claude vision instead of pdfplumber. Use for scanned PDFs.",
    )
    p.add_argument("--dry-run", action="store_true", help="Parse and chunk but do not write to DB or upload.")
    return p.parse_args()


def main() -> int:
    # Windows consoles default to cp1252 which can't print our French text.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")

    args = parse_args()

    # Load env from .env.local
    repo_root = Path(__file__).resolve().parent.parent
    load_dotenv(repo_root / ".env.local")

    if args.from_pending:
        supabase = get_supabase()
        return process_pending_queue(supabase)

    # Single-PDF mode requires the metadata flags.
    missing = [
        flag for flag, value in (
            ("--pdf", args.pdf),
            ("--title", args.title),
            ("--reference", args.reference),
            ("--source-type", args.source_type),
            ("--source-authority", args.source_authority),
        ) if not value
    ]
    if missing:
        print(
            f"Missing required arg(s) for single-PDF mode: {', '.join(missing)}. "
            f"Use --from-pending to drain admin uploads instead.",
            file=sys.stderr,
        )
        return 1

    if not args.pdf.exists():
        print(f"PDF not found: {args.pdf}", file=sys.stderr)
        return 1

    print(f"Parsing {args.pdf.name}…")
    if args.ocr:
        raw = extract_text_via_vision(args.pdf)
    else:
        raw = extract_text(args.pdf)
    text = normalize_whitespace(raw)
    print(f"  → {len(text):,} characters of text after normalization")

    if args.stop_at:
        # Apply after TOC filtering so TOC mentions of the marker don't count.
        # The TOC also gets filtered to body-style lines (we already dropped
        # dot-leader and trailing-page-number entries), so this scans only
        # real body text.
        stop_re = re.compile(args.stop_at, re.IGNORECASE)
        m = stop_re.search(text)
        if m:
            text = text[: m.start()]
            print(f"  → truncated at /{args.stop_at}/ → {len(text):,} characters")
        else:
            print(f"  → --stop-at pattern not found, ingesting full text")

    articles = list(iter_articles(text))
    print(f"  → detected {len(articles)} article-aligned segments")

    chunks = build_chunks(articles)
    print(f"  → produced {len(chunks)} chunks ({MIN_CHUNK_CHARS}-{MAX_CHUNK_CHARS} chars each)")

    if args.dry_run:
        with_ref = [c for c in chunks if c.article_ref]
        without_ref = [c for c in chunks if not c.article_ref]
        unique_refs = sorted({c.article_ref for c in with_ref if c.article_ref})
        print(f"  → {len(with_ref)} chunks have an article_ref, {len(without_ref)} do not")
        print(f"  → {len(unique_refs)} unique article refs")
        print(f"  → first 5 refs: {unique_refs[:5]}")
        print(f"  → last 5 refs:  {unique_refs[-5:]}")

        # Show 3 samples with refs, sampled from start/middle/end.
        if with_ref:
            samples = [with_ref[0], with_ref[len(with_ref) // 2], with_ref[-1]]
            for c in samples:
                print("\n----")
                print(f"article_ref={c.article_ref}  parent={c.parent_section}")
                print(f"chunk_index={c.chunk_index}  len={len(c.content)}")
                print(c.content[:400] + ("…" if len(c.content) > 400 else ""))

        # And 1 without-ref sample to show what would get filtered.
        if without_ref:
            print("\n---- (without ref — would be filtered) ----")
            c = without_ref[0]
            print(f"len={len(c.content)}")
            print(c.content[:200] + ("…" if len(c.content) > 200 else ""))
        return 0

    if not chunks:
        print("No chunks produced — aborting.", file=sys.stderr)
        return 2

    storage_key = f"{slugify(args.reference)}.pdf"

    supabase = get_supabase()

    print(f"Uploading PDF to corpus/{storage_key}…")
    upload_pdf(supabase, args.pdf, storage_key)

    print("Upserting document row…")
    doc_id = upsert_document(
        supabase,
        title=args.title,
        reference=args.reference,
        source_type=args.source_type,
        source_authority=args.source_authority,
        is_primary_source=bool(args.primary_source),
        effective_date=args.effective_date,
        storage_path=storage_key,
    )
    print(f"  → document id {doc_id}")

    try:
        embed_chunks(chunks)
        insert_chunks(supabase, doc_id, chunks)
        mark_ready(supabase, doc_id)
    except Exception as exc:
        mark_failed(supabase, doc_id)
        print(f"Ingestion failed, marked document as 'failed': {exc}", file=sys.stderr)
        raise

    print(f"\n✓ {args.title} ingested: {len(chunks)} chunks ready for retrieval.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
