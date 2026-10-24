import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StandardThreadDemo } from "./demo/standard-thread-demo.js";
import "./demo/standard-thread.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><StandardThreadDemo /></StrictMode>,
);
