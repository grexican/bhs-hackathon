import type { FeedItem } from "../api";
import {
  formatDeadline,
  isUrgent,
  PRIORITY_META,
  type Priority,
  priorityOf,
  sourceMeta,
} from "../feedUtils";

// The feed, grouped into priority bands so the urgent stuff is unmissable and
// the noise is tucked away at the bottom. Each band is a labelled section; the
// "Filtered out" band is collapsed by default.

const ORDER: Priority[] = ["high", "medium", "low", "noise"];

export function FeedView({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return <p className="muted">Nothing here yet — hit "Scan sources" to pull everything in.</p>;
  }

  // Bucket every item by its priority once, then render the bands in order.
  const groups: Record<Priority, FeedItem[]> = { high: [], medium: [], low: [], noise: [] };
  for (const item of items) groups[priorityOf(item)].push(item);

  return (
    <div className="feed">
      {ORDER.map((priority) => {
        const group = groups[priority];
        if (group.length === 0) return null;
        const meta = PRIORITY_META[priority];

        // The noise band collapses behind a <details> so it's out of the way.
        if (priority === "noise") {
          return (
            <details key={priority} className="band band--noise">
              <summary className="band__summary">
                <span className="band__dot" style={{ background: meta.color }} />
                {meta.label} · {group.length} hidden
              </summary>
              <div className="band__items">
                {group.map((item) => (
                  <Card key={item.id} item={item} priority={priority} />
                ))}
              </div>
            </details>
          );
        }

        return (
          <section key={priority} className="band">
            <h3 className="band__title">
              <span className="band__dot" style={{ background: meta.color }} />
              {meta.label}
              <span className="band__count">{group.length}</span>
            </h3>
            <div className="band__items">
              {group.map((item) => (
                <Card key={item.id} item={item} priority={priority} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// One feed card. Coloured left rail by source, an importance bar, a category
// badge, and a deadline pill (red when it's within two days).
function Card({ item, priority }: { item: FeedItem; priority: Priority }) {
  const src = sourceMeta(item.source);
  const pColor = PRIORITY_META[priority].color;
  const relevance = item.relevance ?? 0;

  const inner = (
    <>
      <div className="card-item__rail" style={{ background: src.color }} />
      <div className="card-item__icon" title={src.label}>
        {src.icon}
      </div>
      <div className="card-item__body">
        <div className="card-item__head">
          <span className="card-item__source">{src.label}</span>
          {item.category && (
            <span className={`badge badge--${item.category}`}>{item.category}</span>
          )}
          {item.deadline && (
            <span className={isUrgent(item.deadline) ? "due due--urgent" : "due"}>
              ⏰ {formatDeadline(item.deadline)}
            </span>
          )}
        </div>
        <h4 className="card-item__title">{item.title}</h4>
        {item.summary && <p className="card-item__summary">{item.summary}</p>}
        <div className="card-item__foot">
          <span className="imp">
            <span className="imp__track">
              <span
                className="imp__fill"
                style={{ width: `${relevance}%`, background: pColor }}
              />
            </span>
            <span className="imp__num">{relevance}</span>
          </span>
        </div>
      </div>
    </>
  );

  // If the source gave us a link, the whole card opens it in a new tab.
  return item.url ? (
    <a className="card-item card-item--link" href={item.url} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <article className="card-item">{inner}</article>
  );
}
