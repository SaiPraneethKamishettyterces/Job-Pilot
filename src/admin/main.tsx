import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import { AdminApp } from "./App";

createRoot(document.getElementById("admin-root")!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>
);
