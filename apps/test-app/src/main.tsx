import "@fontsource-variable/recursive";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import { SuccessToastProvider } from "./components/success_toast.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SuccessToastProvider>
      <App />
    </SuccessToastProvider>
  </StrictMode>,
);
