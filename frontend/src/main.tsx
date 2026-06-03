import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";

const storedTheme = localStorage.getItem("midc-theme");
document.documentElement.classList.add(
  storedTheme === "light" ? "light" : "dark"
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
