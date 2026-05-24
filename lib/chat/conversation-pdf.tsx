import type { FC, ReactNode } from "react";
import {
  Document as _Document,
  Page as _Page,
  Text as _Text,
  View as _View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ConversationTranscript } from "@/app/chat/conversation-actions";

// @react-pdf/renderer ships React 18 component types that don't satisfy
// React 19's stricter JSX element class shape. The library works at runtime;
// we just need to relax the types until upstream catches up.
type PdfFC = FC<{
  children?: ReactNode;
  style?: unknown;
  fixed?: boolean;
  wrap?: boolean;
  size?: string;
  title?: string;
  author?: string;
  render?: (args: { pageNumber: number; totalPages: number }) => ReactNode;
}>;
const Document = _Document as unknown as PdfFC;
const Page = _Page as unknown as PdfFC;
const Text = _Text as unknown as PdfFC;
const View = _View as unknown as PdfFC;

const BRAND_INDIGO = "#2F00B9";
const BRAND_GOLD = "#E8BF3C";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.5,
    color: "#111111",
  },
  header: {
    marginBottom: 24,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: BRAND_INDIGO,
  },
  brand: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: BRAND_INDIGO,
    letterSpacing: 1,
  },
  title: {
    marginTop: 6,
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
  },
  meta: {
    marginTop: 4,
    fontSize: 9,
    color: "#666666",
  },
  turn: {
    marginBottom: 16,
  },
  roleUser: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: BRAND_INDIGO,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  roleLaya: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#7a6116",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  userBubble: {
    backgroundColor: "#f4f0ff",
    borderLeftWidth: 3,
    borderLeftColor: BRAND_INDIGO,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  layaBubble: {
    backgroundColor: "#fdf8ec",
    borderLeftWidth: 3,
    borderLeftColor: BRAND_GOLD,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  body: {
    fontSize: 11,
    color: "#111111",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 56,
    right: 56,
    fontSize: 8,
    color: "#999999",
    textAlign: "center",
  },
});

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

function ConversationDoc({ transcript }: { transcript: ConversationTranscript }) {
  return (
    <Document title={transcript.title} author="Laya">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.brand}>LAYA</Text>
          <Text style={styles.title}>{transcript.title}</Text>
          <Text style={styles.meta}>
            Conversation du {formatDate(transcript.createdAt)} ·{" "}
            {transcript.messages.length} message
            {transcript.messages.length > 1 ? "s" : ""}
          </Text>
        </View>

        {transcript.messages.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <View key={i} style={styles.turn} wrap={true}>
              <Text style={isUser ? styles.roleUser : styles.roleLaya}>
                {isUser ? "Vous" : "Laya"}
              </Text>
              <View style={isUser ? styles.userBubble : styles.layaBubble}>
                <Text style={styles.body}>{m.content}</Text>
              </View>
            </View>
          );
        })}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Laya — Assistant juridique du droit du travail ivoirien · Page ${pageNumber}/${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export async function renderConversationPdf(
  transcript: ConversationTranscript,
): Promise<Buffer> {
  return renderToBuffer(<ConversationDoc transcript={transcript} />);
}
