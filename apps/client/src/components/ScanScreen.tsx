import { useState } from "react";

import type { Bike } from "../api";
import { HealthBadge } from "./HealthBadge";
import { Stars } from "./Stars";

// The rider's starting screen. In the real world they'd point a camera at a
// bike's QR sticker; here we "simulate" a scan two ways: pick a bike number
// (1–X), or tap a bike's fake-QR card. There's also a demo simulate button.
type ScanScreenProps = {
  bikes: Bike[];
  onScan: (code: string) => void;
  onSimulate: () => void;
};

export function ScanScreen({ bikes, onScan, onSimulate }: ScanScreenProps) {
  // Number the bikes by id so "bike #2" always means the same physical bike,
  // even as the worst-first list re-sorts when new reviews come in.
  const numbered = [...bikes].sort((a, b) => a.id - b.id);
  const count = numbered.length;

  const [num, setNum] = useState(1);
  // Keep the typed number inside 1..count so we never point past the list.
  const safeNum = Math.min(Math.max(num, 1), Math.max(count, 1));
  const target = numbered[safeNum - 1];

  // "Scan" the bike at the chosen number.
  function handleNumberScan(e: React.FormEvent) {
    e.preventDefault();
    if (target) onScan(target.code);
  }

  return (
    <section className="card">
      <h2>Scan a bike before you ride</h2>
      <p className="muted">
        "Scan" a bike to see what recent riders said, then decide whether to check it out on Bicing.
      </p>

      <form className="number-scan" onSubmit={handleNumberScan}>
        <span className="number-scan__label">Simulate a scan — pick a bike number (1–{count})</span>
        <div className="number-scan__row">
          <input
            type="number"
            min={1}
            max={count}
            value={safeNum}
            onChange={(e) => setNum(Number(e.target.value))}
            aria-label="Bike number"
            disabled={count === 0}
          />
          <button type="submit" disabled={count === 0}>
            Scan bike #{safeNum}
          </button>
        </div>
        {target && (
          <span className="muted">
            #{safeNum} → {target.code} · {target.station}
          </span>
        )}
      </form>

      <div className="scan-grid">
        {numbered.map((bike, i) => (
          <button key={bike.id} type="button" className="qr-card" onClick={() => onScan(bike.code)}>
            <span className="qr-card__num">#{i + 1}</span>
            <span className="qr-card__qr" aria-hidden="true">
              ▩▩▩
            </span>
            <span className="qr-card__code">{bike.code}</span>
            <span className="qr-card__meta">
              {bike.model} · {bike.station}
            </span>
            <HealthBadge bike={bike} />
            <span className="qr-card__rating">
              <Stars value={Math.round(bike.avg_rating ?? 0)} />
              <span className="muted">({bike.review_count})</span>
            </span>
          </button>
        ))}
      </div>

      <button type="button" className="link-btn" onClick={onSimulate}>
        🎲 Simulate a random rider scanning a bike
      </button>
    </section>
  );
}
