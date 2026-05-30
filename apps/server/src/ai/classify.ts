import Anthropic from "@anthropic-ai/sdk";

import { env } from "../env.js";

// This is the "reading" brain. Given one raw item (an email for now), Claude
// decides: is it school-related, what kind of thing is it, a one-line summary,
// and how much a student should care (0-100). We force a tool call so the
// answer comes back as structured JSON instead of free text we'd have to parse.

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// The shape Claude must return. Kept small on purpose.
export type Classification = {
  is_school: boolean;
  category: "assignment" | "event" | "announcement" | "news" | "admin" | "other";
  summary: string;
  relevance: number; // 0-100
  deadline?: string | null; // ISO date if the item has a clear due date
};

// A raw thing to classify, source-agnostic so other sources can reuse this.
export type RawItem = {
  title: string;
  sender?: string;
  body: string;
};

// The tool Claude is forced to call. Its input schema IS our return shape,
// so a successful call hands us exactly the fields we want.
const TOOL = {
  name: "record_classification",
  description: "Record how this item should appear in a student's school dashboard.",
  input_schema: {
    type: "object" as const,
    properties: {
      is_school: {
        type: "boolean",
        description: "True if this is about school (classes, teachers, events, admin).",
      },
      category: {
        type: "string",
        enum: ["assignment", "event", "announcement", "news", "admin", "other"],
      },
      summary: { type: "string", description: "One short plain-English sentence." },
      relevance: {
        type: "integer",
        description: "0-100: how much a typical student should care right now.",
      },
      deadline: {
        type: "string",
        description:
          "If the item has a clear due date / deadline / event date, the date as ISO 8601 (YYYY-MM-DD). Omit entirely if there is no specific date.",
      },
    },
    required: ["is_school", "category", "summary", "relevance"],
  },
};

// Classify a single item. Uses Haiku — cheap and plenty for triage (see the
// model-discipline / budget rules). Escalate to a bigger model only if needed.
export async function classify(item: RawItem): Promise<Classification> {
  // Cap the body so we never send a giant email and overpay for tokens.
  const body = item.body.slice(0, 4000);

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "record_classification" },
    messages: [
      {
        role: "user",
        content:
          "You triage items for a high-school student's dashboard. Classify the item below. " +
          "Today's date is 2026-05-30. If the content mentions a due date or event date, " +
          "resolve it to an absolute ISO date for the deadline field.\n\n" +
          `From: ${item.sender ?? "unknown"}\n` +
          `Subject/Title: ${item.title}\n\n` +
          `Content:\n${body}`,
      },
    ],
  });

  // With forced tool use, the first tool_use block holds our JSON.
  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a classification.");
  }
  return toolUse.input as Classification;
}
