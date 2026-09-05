import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installLegacyPublicAnalyticsBridge } from "./features/analytics";
import "./styles.css";
import "./owner-contracts.css";

installLegacyPublicAnalyticsBridge();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
