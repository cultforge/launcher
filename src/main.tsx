import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installConsoleMirror } from "./lib/logger";
import { startUiScale } from "./lib/uiScale";

startUiScale();
installConsoleMirror();

ReactDOM.createRoot(document.getElementById("origin") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
