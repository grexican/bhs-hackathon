import { useState } from "react";

import { type IssueTag, ISSUE_TAGS } from "../api";
import type { NewReview } from "../hooks/useBikes";
import { Stars } from "./Stars";

// The form a rider fills in to review the bike they just scanned: their name,
// a star rating, an optional problem tag, and an optional note.
type ReviewFormProps = {
  onSubmit: (review: NewReview) => void;
};

export function ReviewForm({ onSubmit }: ReviewFormProps) {
  const [rider, setRider] = useState("You");
  // Start with no rating (0) so the rider has to choose, instead of a biased 5.
  const [rating, setRating] = useState(0);
  const [issues, setIssues] = useState<IssueTag[]>([]);
  const [comment, setComment] = useState("");

  // Add or remove a problem tag — a bike can have several at once.
  function toggleIssue(tag: IssueTag) {
    setIssues((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  // Send the review up, then reset the form for the next one. A rating is
  // required — the server only accepts 1–5, so don't submit an empty one.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rider.trim() || rating < 1) return;
    onSubmit({ rider: rider.trim(), rating, issues, comment: comment.trim() });
    setComment("");
    setIssues([]);
    setRating(0);
  }

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <h3>Leave a review</h3>

      <label className="review-form__row">
        <span>Your name</span>
        <input value={rider} onChange={(e) => setRider(e.target.value)} maxLength={40} />
      </label>

      <div className="review-form__row">
        <span>Rating</span>
        <span className="review-form__rating">
          <Stars value={rating} onChange={setRating} />
          {rating === 0 && <span className="muted">Tap to rate</span>}
        </span>
      </div>

      <div className="review-form__row">
        <span>Any problems? (pick all that apply)</span>
        <div className="chips">
          <button
            type="button"
            className={issues.length === 0 ? "chip chip--on" : "chip"}
            onClick={() => setIssues([])}
          >
            No problem
          </button>
          {ISSUE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={issues.includes(tag) ? "chip chip--on chip--issue" : "chip"}
              aria-pressed={issues.includes(tag)}
              onClick={() => toggleIssue(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <label className="review-form__row">
        <span>Note (optional)</span>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="How was the ride?"
          maxLength={280}
        />
      </label>

      <button type="submit" className="primary-btn" disabled={rating < 1}>
        Submit review
      </button>
    </form>
  );
}
