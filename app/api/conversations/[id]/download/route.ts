import { NextResponse } from "next/server";
import { getConversationTranscript } from "@/app/chat/conversation-actions";
import { renderConversationPdf } from "@/lib/chat/conversation-pdf";
import { renderConversationDocx } from "@/lib/chat/conversation-docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(title: string): string {
  // Content-Disposition headers are ByteStrings (Latin-1), so we must keep
  // this ASCII. NFKD splits "é" into "e" + U+0301; stripping the combining
  // range (and anything else outside printable ASCII) gives a clean fallback.
  return (
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/[\/\\?%*:|"<>]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "conversation"
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format");
  if (format !== "pdf" && format !== "docx") {
    return NextResponse.json({ error: "format must be pdf or docx" }, { status: 400 });
  }

  const result = await getConversationTranscript(id);
  if (!result.ok) {
    const status = result.error === "unauthorized" ? 401 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  const base = safeFilename(result.transcript.title);

  if (format === "pdf") {
    const buf = await renderConversationPdf(result.transcript);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"; filename*=UTF-8''${encodeURIComponent(base)}.pdf`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const buf = await renderConversationDocx(result.transcript);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${base}.docx"; filename*=UTF-8''${encodeURIComponent(base)}.docx`,
      "Cache-Control": "private, no-store",
    },
  });
}
