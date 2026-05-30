import { useState } from "react";

import { BikeDetail } from "./components/BikeDetail";
import { OperatorDashboard } from "./components/OperatorDashboard";
import { ScanScreen } from "./components/ScanScreen";
import { useBikes } from "./hooks/useBikes";

// Top-level page for BiciCheck. A persona switch flips between the two sides:
// riders (scan a bike, read/leave reviews) and operators (fleet health, service
// bikes). All the data lives in the useBikes() hook.
export function App() {
  const [persona, setPersona] = useState<"rider" | "operator">("rider");
  const { bikes, detail, loading, error, flash, openBike, closeBike, addReview, serviceBike, simulate } =
    useBikes();

  return (
    <main className="page">
      <header className="page__header">
        <h1>🚲 BiciCheck</h1>
        <p>Scan a Bicing bike before you ride — see its reviews, dodge the broken ones.</p>

        <div className="persona-switch" role="tablist" aria-label="Choose your view">
          <button
            type="button"
            role="tab"
            aria-selected={persona === "rider"}
            className={persona === "rider" ? "persona-switch__btn persona-switch__btn--on" : "persona-switch__btn"}
            onClick={() => {
              setPersona("rider");
              closeBike();
            }}
          >
            🚴 Rider
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={persona === "operator"}
            className={persona === "operator" ? "persona-switch__btn persona-switch__btn--on" : "persona-switch__btn"}
            onClick={() => {
              setPersona("operator");
              closeBike();
            }}
          >
            🔧 Operator
          </button>
        </div>
      </header>

      {error && <div className="error">Error: {error}</div>}
      {flash && <div className="flash">{flash}</div>}
      {loading && bikes.length === 0 && <p className="muted">Loading bikes…</p>}

      {/* A scanned/inspected bike takes over the screen in either persona. */}
      {detail ? (
        <BikeDetail
          bike={detail.bike}
          reviews={detail.reviews}
          persona={persona}
          onBack={closeBike}
          onAddReview={(review) => addReview(detail.bike.code, review)}
          onService={serviceBike}
        />
      ) : persona === "rider" ? (
        <ScanScreen bikes={bikes} onScan={openBike} onSimulate={simulate} />
      ) : (
        <OperatorDashboard
          bikes={bikes}
          onInspect={openBike}
          onService={serviceBike}
          onSimulate={simulate}
        />
      )}

      <footer className="page__footer">
        <p>
          Fake bikes + reviews are seeded in SQLite so the demo works offline. Edit{" "}
          <code>apps/server/src/seed.ts</code> to change them.
        </p>
      </footer>
    </main>
  );
}
