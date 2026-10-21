import "@fontsource-variable/recursive";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RuntimeDemo } from "./demo/runtime-demo.js";
import { App } from "./app.js";
import { SuccessToastProvider } from "./components/success_toast.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SuccessToastProvider>
      {new URLSearchParams(window.location.search).get("demo") === "runtime" ? <RuntimeDemo /> : <App />}
    </SuccessToastProvider>
  </StrictMode>,
);
