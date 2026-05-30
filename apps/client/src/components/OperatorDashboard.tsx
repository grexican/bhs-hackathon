import { type Bike, bikeHealth } from "../api";
import { HealthBadge } from "./HealthBadge";
import { Stars } from "./Stars";

// The Bicing maintenance view: every bike, worst health first, so an operator
// can spot problem bikes and service them. The list arrives pre-sorted by the
// server (most open issues first).
type OperatorDashboardProps = {
  bikes: Bike[];
  onInspect: (code: string) => void;
  onService: (bike: Bike) => void;
  onSimulate: () => void;
};

export function OperatorDashboard({
  bikes,
  onInspect,
  onService,
  onSimulate,
}: OperatorDashboardProps) {
  // How many bikes currently need attention — the headline number.
  const needAttention = bikes.filter((b) => bikeHealth(b).tone === "bad").length;

  return (
    <section className="card">
      <div className="bike-detail__head">
        <h2>Fleet health</h2>
        <button type="button" className="link-btn" onClick={onSimulate}>
          🎲 Simulate activity
        </button>
      </div>
      <p className="muted">
        {needAttention > 0
          ? `${needAttention} bike${needAttention > 1 ? "s" : ""} need attention right now.`
          : "All bikes are looking healthy."}
      </p>

      <ul className="fleet-list">
        {bikes.map((bike) => (
          <li key={bike.id} className="fleet-row">
            <div className="fleet-row__main">
              <span className="fleet-row__code">{bike.code}</span>
              <span className="muted">
                {bike.model} · {bike.station}
              </span>
            </div>
            <div className="fleet-row__stats">
              <HealthBadge bike={bike} />
              {bike.open_issues > 0 && (
                <span className="badge badge--bad">{bike.open_issues} issue</span>
              )}
              <span className="fleet-row__rating">
                <Stars value={Math.round(bike.avg_rating ?? 0)} />
              </span>
            </div>
            <div className="fleet-row__actions">
              <button type="button" className="chip" onClick={() => onInspect(bike.code)}>
                Inspect
              </button>
              <button type="button" className="chip chip--on" onClick={() => onService(bike)}>
                Service
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
