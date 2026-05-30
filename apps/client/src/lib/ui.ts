// Tiny shared helpers for turning data into display strings + colors.
// Keeping these in one place means every page formats things the same way.

import type { Level, Position, Tier } from "../api";

export const LEVEL_LABELS: Record<Level, string> = {
  middle_school: "Middle School",
  jv: "JV",
  varsity: "Varsity",
  club: "Club / Travel",
  college: "College",
};

export const POSITION_LABELS: Record<Position, string> = {
  OH: "Outside Hitter",
  OPP: "Opposite",
  MB: "Middle Blocker",
  S: "Setter",
  L: "Libero",
  DS: "Defensive Specialist",
};

// Each performance tier gets a color, used for badges, bars, and rings.
export const TIER_COLORS: Record<Tier, string> = {
  elite: "#7c3aed",
  strong: "#16a34a",
  solid: "#2563eb",
  developing: "#d97706",
  "needs work": "#dc2626",
};

export function tierColor(tier: Tier): string {
  return TIER_COLORS[tier] ?? "#6b7280";
}

// A 0-100 score maps to a color on a red→green-ish scale via its tier.
export function scoreColor(score: number): string {
  if (score >= 88) return TIER_COLORS.elite;
  if (score >= 76) return TIER_COLORS.strong;
  if (score >= 60) return TIER_COLORS.solid;
  if (score >= 45) return TIER_COLORS.developing;
  return TIER_COLORS["needs work"];
}

// "Maya Torres" → "MT" for the round avatars.
export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

// Friendly date like "Sat, May 31" and a short time "6:00 PM".
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// "3 hours ago" style relative time for the chat feed.
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
