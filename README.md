# Laya

AI labor-law assistant for Côte d'Ivoire. Grounded answers from official sources (Code du Travail, décrets, conventions collectives) with audit-grade citations.

**Status:** Phase A scaffolding — closed beta. See [`laya-project-spec.md`](./laya-project-spec.md) for the contract.

## Stack

Next.js 15 (App Router) · Supabase (Auth + Postgres + pgvector) · Vercel AI SDK · Anthropic Claude Sonnet (Citations API) · Voyage AI (embeddings + rerank)

## Local setup

```bash
pnpm install
cp .env.example .env.local   # fill in secrets
pnpm dev
```

## Branding

Indigo `#2F00B9`, gold `#E8BF3C`, Plus Jakarta Sans. See [`Branding/brand.md`](./Branding/brand.md).
