import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Manual topic-level cache invalidation (spec §0 grill, Build 2). For known
// law changes the admin can drop every cached response whose normalized query
// or answer text mentions a keyword (e.g. "SMIG", "durée du travail"). The
// auto layers (per-document on ingest, prompt-hash on prompt/model change,
// 30-day TTL) cover the rest.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    keyword?: string;
  } | null;

  // Sanitize: keep only letters / digits / spaces / hyphens. Prevents the
  // keyword from injecting PostgREST `.or()` filter syntax (commas, parens).
  const keyword = (body?.keyword ?? "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim();
  if (!keyword) {
    return NextResponse.json(
      { error: "missing or invalid keyword" },
      { status: 400 },
    );
  }

  const service = createServiceClient();
  const like = `%${keyword}%`;
  const { data, error } = await service
    .from("cached_responses")
    .delete()
    .or(`query_norm.ilike.${like},response_text.ilike.${like}`)
    .select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: data?.length ?? 0, keyword });
}
