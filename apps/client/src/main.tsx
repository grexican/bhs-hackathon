import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { AuthProvider } from "./auth";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Could not find #root element. Check index.html.");
}

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
