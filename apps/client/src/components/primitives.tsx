import type { ReactNode } from "react";

// A few tiny building blocks every page reuses, so the look stays consistent
// and the page files stay focused on their actual content.

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="pagehead">
      <div>
        <h1 className="pagehead__title">{title}</h1>
        {subtitle && <p className="pagehead__sub muted">{subtitle}</p>}
      </div>
      {action && <div className="pagehead__action">{action}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="muted state-note">⏳ {label}</p>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="error">⚠️ {message}</div>;
}

export function Empty({ label }: { label: string }) {
  return <p className="muted state-note">{label}</p>;
}
