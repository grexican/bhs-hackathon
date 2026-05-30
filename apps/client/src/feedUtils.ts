import type { FeedItem } from "./api";

// Shared helpers + look-up tables for the dashboard. Keeping them in one place
// means the charts, stat cards, and feed all label and colour things the same.

// How we describe each source in the UI: a friendly name, an icon, and a
// brand-ish colour used by the source bar chart and the card rails.
export const SOURCE_META: Record<string, { label: string; icon: string; color: string }> = {
  gmail: { label: "Gmail", icon: "✉️", color: "#ea4335" },
  classroom: { label: "Classroom", icon: "🎓", color: "#1a73e8" },
  calendar: { label: "Calendar", icon: "📅", color: "#34a853" },
  drive: { label: "Drive", icon: "📄", color: "#f4b400" },
  youtube: { label: "YouTube", icon: "▶️", color: "#ff0000" },
  instagram: { label: "Instagram", icon: "📸", color: "#e1306c" },
  whatsapp: { label: "WhatsApp", icon: "💬", color: "#25d366" },
  veracross: { label: "Veracross", icon: "📊", color: "#5b21b6" },
  buzz: { label: "Accelerate", icon: "📚", color: "#0ea5e9" },
};

export function sourceMeta(source: string) {
  return SOURCE_META[source] ?? { label: source, icon: "•", color: "#9ca3af" };
}

// Four priority buckets the whole UI is organised around. "noise" = the AI
// decided it isn't school-related at all.
export type Priority = "high" | "medium" | "low" | "noise";

export const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; blurb: string }
> = {
  high: { label: "Needs your attention", color: "#dc2626", blurb: "High importance" },
  medium: { label: "Worth knowing", color: "#d97706", blurb: "Medium importance" },
  low: { label: "Good to know", color: "#2563eb", blurb: "Lower importance" },
  noise: { label: "Filtered out", color: "#9ca3af", blurb: "Not school-related" },
};

// Turn a raw item into its priority bucket from the AI's school flag + score.
export function priorityOf(item: FeedItem): Priority {
  if (item.is_school === 0) return "noise";
  const r = item.relevance ?? 0;
  if (r >= 80) return "high";
  if (r >= 50) return "medium";
  return "low";
}

// How many whole days until a date (negative = in the past), counting by
// calendar day so "later today" still reads as 0 / "Today".
function daysUntil(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  const target = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

// A short human label for a deadline: "Today", "Tomorrow", a weekday this
// week, or a "Jun 9" style date further out.
export function formatDeadline(iso: string): string {
  const days = daysUntil(iso);
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  const d = new Date(iso);
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Is this deadline within the next 7 days (and not already past)?
export function isDueSoon(iso: string | null): boolean {
  if (!iso) return false;
  const days = daysUntil(iso);
  return days >= 0 && days <= 7;
}

// Deadlines closer than 2 days get a red "urgent" treatment on the card.
export function isUrgent(iso: string | null): boolean {
  if (!iso) return false;
  const days = daysUntil(iso);
  return days >= 0 && days <= 2;
}
