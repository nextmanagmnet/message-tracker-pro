import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary, reloadForNewVersion } from "./components/ErrorBoundary.tsx";
import "./index.css";
import "./i18n";
import { initMonitoring } from "./lib/monitoring";

initMonitoring();

// A page file from an older version failed to load (the site was updated while this tab was open).
window.addEventListener("vite:preloadError", (e) => {
  if (reloadForNewVersion()) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
