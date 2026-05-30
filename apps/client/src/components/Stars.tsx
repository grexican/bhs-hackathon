// Shows a 1–5 star rating. If `onChange` is passed it's clickable (for the
// review form); without it, it's just a read-only display.
type StarsProps = {
  value: number;
  onChange?: (value: number) => void;
};

export function Stars({ value, onChange }: StarsProps) {
  const stars = [1, 2, 3, 4, 5];

  // Read-only display: plain filled/empty stars.
  if (!onChange) {
    return (
      <span className="stars" aria-label={`${value} out of 5 stars`}>
        {stars.map((n) => (
          <span key={n} className={n <= value ? "stars__star stars__star--on" : "stars__star"}>
            ★
          </span>
        ))}
      </span>
    );
  }

  // Interactive: each star is a button that sets the rating.
  return (
    <span className="stars stars--input" role="radiogroup" aria-label="Rating">
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          className={n <= value ? "stars__star stars__star--on" : "stars__star"}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          aria-pressed={n === value}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}
