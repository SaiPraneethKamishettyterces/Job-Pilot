import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import "./admin.css"; // Command Center theme — overrides the shared palette for admin
import { AdminApp } from "./App";

createRoot(document.getElementById("admin-root")!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>
);
