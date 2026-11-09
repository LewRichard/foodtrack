import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { startCloud } from "./lib/cloud.ts";
import { isNative } from "./lib/native.ts";
import { requestPersistentStorage } from "./lib/store.ts";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD && !isNative) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}

requestPersistentStorage();
void startCloud();
