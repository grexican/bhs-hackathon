import { type FormEvent, useState } from "react";

import { api, type Message } from "../api";
import { useAuth } from "../auth";
import { Avatar } from "../components/Avatar";
import { Card, ErrorBox, Loading, PageHeader } from "../components/primitives";
import { useApi } from "../hooks/useApi";
import { timeAgo } from "../lib/ui";

// The team's communication hub: coach announcements pinned up top, and an open
// chat thread everyone can post to. Coaches get the option to post an
// announcement and pin it; players just chat.
export function TeamChat() {
  const { user } = useAuth();
  const teamId = user?.team_id ?? 1;
  const { data, loading, error, reload } = useApi<Message[]>(`/api/teams/${teamId}/messages`);
  const isCoach = user?.role === "coach";

  const announcements = (data ?? []).filter((m) => m.kind === "announcement").sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const chat = (data ?? []).filter((m) => m.kind === "chat");

  return (
    <div className="stack">
      <PageHeader title="Team Feed" subtitle="Announcements from the coach and the team chat — all in one place." />

      {error && <ErrorBox message={error} />}

      <Card>
        <h3 className="panel__title">📣 Announcements</h3>
        {loading ? (
          <Loading />
        ) : announcements.length === 0 ? (
          <p className="muted state-note">No announcements yet.</p>
        ) : (
          <ul className="announcements">
            {announcements.map((m) => (
              <li key={m.id} className={`announcement ${m.pinned ? "announcement--pinned" : ""}`}>
                {m.pinned && <span className="announcement__pin">📌 Pinned</span>}
                <p>{m.body}</p>
                <span className="muted announcement__by">
                  {m.author.name} · {timeAgo(m.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="panel__title">💬 Team chat</h3>
        {loading ? (
          <Loading />
        ) : (
          <ul className="chat">
            {chat.map((m) => {
              const mine = m.author.id === user?.id;
              return (
                <li key={m.id} className={`chatmsg ${mine ? "chatmsg--mine" : ""}`}>
                  {!mine && <Avatar name={m.author.name} color={m.author.color} size={32} />}
                  <div className="chatmsg__bubble">
                    {!mine && (
                      <span className="chatmsg__author">
                        {m.author.name}
                        {m.author.role === "coach" && <span className="chatmsg__coach"> Coach</span>}
                      </span>
                    )}
                    <p>{m.body}</p>
                    <span className="chatmsg__time">{timeAgo(m.created_at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Composer teamId={teamId} canAnnounce={isCoach} onSent={reload} />
      </Card>
    </div>
  );
}

// The message box. Coaches can switch to "announcement" mode and pin.
function Composer({ teamId, canAnnounce, onSent }: { teamId: number; canAnnounce: boolean; onSent: () => void }) {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"chat" | "announcement">("chat");
  const [pinned, setPinned] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || !user) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/api/teams/${teamId}/messages`, {
        author_id: user.id,
        kind,
        body: body.trim(),
        pinned: kind === "announcement" ? pinned : false,
      });
      setBody("");
      setPinned(false);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="composer" onSubmit={send}>
      {error && <ErrorBox message={error} />}
      {canAnnounce && (
        <div className="composer__opts">
          <label className="composer__toggle">
            <input type="checkbox" checked={kind === "announcement"} onChange={(e) => setKind(e.target.checked ? "announcement" : "chat")} />
            Post as announcement
          </label>
          {kind === "announcement" && (
            <label className="composer__toggle">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              📌 Pin it
            </label>
          )}
        </div>
      )}
      <div className="composer__row">
        <input
          value={body}
          placeholder={kind === "announcement" ? "Write an announcement…" : "Message the team…"}
          onChange={(e) => setBody(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={sending}>
          {sending ? "…" : "Send"}
        </button>
      </div>
    </form>
  );
}
