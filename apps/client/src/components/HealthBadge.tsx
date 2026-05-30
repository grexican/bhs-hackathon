import { type Bike, bikeHealth } from "../api";

// A colored pill that summarizes a bike's health at a glance
// (green = good, yellow = caution, red = avoid, grey = no data).
export function HealthBadge({ bike }: { bike: Bike }) {
  const health = bikeHealth(bike);
  return <span className={`badge badge--${health.tone}`}>{health.label}</span>;
}
