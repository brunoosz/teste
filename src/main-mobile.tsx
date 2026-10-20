import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { createCapacitorBridge } from "./lib/capacitor-bridge";
import "@fontsource-variable/inter";
import "./index.css";
import App from "./App";

window.fileflow = createCapacitorBridge();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>
);
