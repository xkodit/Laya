import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Footer,
  PageNumber,
} from "docx";
import type { ConversationTranscript } from "@/app/chat/conversation-actions";

const BRAND_INDIGO = "2F00B9";
const BRAND_GOLD_DARK = "7A6116";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function turnParagraphs(role: "user" | "assistant", content: string): Paragraph[] {
  const isUser = role === "user";
  const accent = isUser ? BRAND_INDIGO : BRAND_GOLD_DARK;

  const label = new Paragraph({
    spacing: { before: 240, after: 60 },
    children: [
      new TextRun({
        text: isUser ? "VOUS" : "LAYA",
        bold: true,
        size: 18,
        color: accent,
        characterSpacing: 20,
      }),
    ],
  });

  // Split on paragraph breaks so each paragraph gets its own bordered block.
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length === 0) blocks.push(content);

  const bodyParas = blocks.map(
    (block) =>
      new Paragraph({
        spacing: { after: 80 },
        indent: { left: 200 },
        border: {
          left: {
            color: accent,
            space: 12,
            style: BorderStyle.SINGLE,
            size: 18,
          },
        },
        children: block.split("\n").flatMap((line, i) =>
          i === 0
            ? [new TextRun({ text: line, size: 22 })]
            : [new TextRun({ text: line, size: 22, break: 1 })],
        ),
      }),
  );

  return [label, ...bodyParas];
}

export async function renderConversationDocx(
  transcript: ConversationTranscript,
): Promise<Buffer> {
  const title = new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: transcript.title,
        bold: true,
        size: 36,
        color: "111111",
      }),
    ],
  });

  const brand = new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({
        text: "LAYA",
        bold: true,
        size: 24,
        color: BRAND_INDIGO,
        characterSpacing: 40,
      }),
    ],
  });

  const meta = new Paragraph({
    spacing: { after: 360 },
    border: {
      bottom: {
        color: BRAND_INDIGO,
        space: 8,
        style: BorderStyle.SINGLE,
        size: 12,
      },
    },
    children: [
      new TextRun({
        text: `Conversation du ${formatDate(transcript.createdAt)} · ${transcript.messages.length} message${transcript.messages.length > 1 ? "s" : ""}`,
        size: 18,
        color: "666666",
      }),
    ],
  });

  const body = transcript.messages.flatMap((m) =>
    turnParagraphs(m.role, m.content),
  );

  const doc = new Document({
    creator: "Laya",
    title: transcript.title,
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Laya — Assistant juridique du droit du travail ivoirien · Page ",
                    size: 16,
                    color: "999999",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: "999999",
                  }),
                  new TextRun({ text: "/", size: 16, color: "999999" }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: "999999",
                  }),
                ],
              }),
            ],
          }),
        },
        children: [brand, title, meta, ...body],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
