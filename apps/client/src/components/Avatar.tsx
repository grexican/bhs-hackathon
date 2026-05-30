import { initials } from "../lib/ui";

// A round, colored initials badge for a person. Used all over the app so the
// roster, chat, and box scores feel personal without needing real photos.
export function Avatar({ name, color, size = 36 }: { name: string; color?: string | null; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ background: color ?? "#475569", width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
