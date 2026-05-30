import { scoreColor } from "../lib/ui";

// A circular progress ring showing a 0-100 score with the letter grade in the
// middle. This is the headline "how good am I" visual on profiles + dashboard.
export function RatingRing({
  score,
  grade,
  size = 120,
  caption,
}: {
  score: number;
  grade: string;
  size?: number;
  caption?: string;
}) {
  const stroke = size * 0.09;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="rating-ring" style={{ width: size }}>
      <svg width={size} height={size} className="rating-ring__svg" role="img" aria-label={`Rating ${score} out of 100, grade ${grade}`}>
        <title>{`Rating ${score} out of 100, grade ${grade}`}</title>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="rating-ring__center">
        <span className="rating-ring__grade" style={{ color }}>
          {grade}
        </span>
        <span className="rating-ring__score">{score}</span>
      </div>
      {caption && <p className="rating-ring__caption">{caption}</p>}
    </div>
  );
}
