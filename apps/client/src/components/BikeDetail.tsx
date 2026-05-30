import { type Bike, bikeHealth, type Review } from "../api";
import type { NewReview } from "../hooks/useBikes";
import { HealthBadge } from "./HealthBadge";
import { ReviewForm } from "./ReviewForm";
import { Stars } from "./Stars";

// The screen shown after "scanning" a bike: its health verdict, recent reviews,
// and an action — riders get a review form, operators get a "serviced" button.
type BikeDetailProps = {
  bike: Bike;
  reviews: Review[];
  persona: "rider" | "operator";
  onBack: () => void;
  onAddReview: (review: NewReview) => void;
  onService: (bike: Bike) => void;
};

// Turn an ISO-ish timestamp into a friendly "3 days ago" string.
function timeAgo(iso: string): string {
  const then = new Date(`${iso.replace(" ", "T")}Z`).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function BikeDetail({
  bike,
  reviews,
  persona,
  onBack,
  onAddReview,
  onService,
}: BikeDetailProps) {
  const health = bikeHealth(bike);

  // A service is a fresh start: reviews from before it become "history" and the
  // current verdict is built only from reviews since. Timestamps share one
  // format, so a plain string compare splits them correctly.
  const since = bike.serviced_at;
  const current = since ? reviews.filter((r) => r.created_at > since) : reviews;
  const history = since ? reviews.filter((r) => r.created_at <= since) : [];

  // One review row, reused for both the current list and the history list.
  const renderReview = (r: Review) => (
    <li key={r.id} className="review">
      <div className="review__top">
        <Stars value={r.rating} />
        <span className="review__rider">{r.rider}</span>
        <span className="muted">{timeAgo(r.created_at)}</span>
      </div>
      {r.issues.length > 0 && (
        <span className="review__issues">
          {r.issues.map((issue) => (
            <span key={issue} className="badge badge--warn">
              {issue}
            </span>
          ))}
        </span>
      )}
      {r.comment && <p className="review__comment">{r.comment}</p>}
    </li>
  );

  return (
    <section className="card">
      <button type="button" className="link-btn" onClick={onBack}>
        ← Back to scan
      </button>

      <div className="bike-detail__head">
        <div>
          <h2 className="bike-detail__code">{bike.code}</h2>
          <p className="muted">
            {bike.model} · {bike.station}
          </p>
        </div>
        <HealthBadge bike={bike} />
      </div>

      <p className={`verdict verdict--${health.tone}`}>{health.blurb}</p>

      <div className="bike-detail__stats">
        <span>
          <Stars value={Math.round(bike.avg_rating ?? 0)} />{" "}
          <strong>{bike.avg_rating ?? "—"}</strong>
        </span>
        <span className="muted">{bike.review_count} reviews</span>
        {bike.open_issues > 0 && (
          <span className="badge badge--bad">
            {bike.open_issues} open issue{bike.open_issues > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {persona === "operator" ? (
        <button type="button" className="primary-btn" onClick={() => onService(bike)}>
          🔧 Mark as serviced (clears open issues)
        </button>
      ) : (
        <ReviewForm onSubmit={onAddReview} />
      )}

      <h3>Recent reviews</h3>
      {current.length === 0 ? (
        <p className="muted">
          {history.length > 0
            ? "No reviews since this bike was serviced — be the first to confirm it's fixed."
            : "No reviews yet — be the first."}
        </p>
      ) : (
        <ul className="review-list">{current.map(renderReview)}</ul>
      )}

      {history.length > 0 && (
        <details className="history">
          <summary>Before last service ({history.length})</summary>
          <ul className="review-list">{history.map(renderReview)}</ul>
        </details>
      )}
    </section>
  );
}
