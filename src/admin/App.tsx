import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { BaseProviders } from "@/app/providers";
import { ErrorBoundary } from "@/components/error-boundary";
import { AdminAuthGate } from "./AdminAuthGate";
import { AdminShell } from "./components/AdminShell";
import { AdminOverviewPage } from "./pages/overview";
import { ExecutiveBillingPage } from "./pages/billing";
import { AdminSourcesPage } from "./pages/sources";
import { AdminExpensesPage } from "./pages/expenses";
import { AdminJobAnalyticsPage } from "./pages/job-analytics";
import { AdminJobsExplorerPage } from "./pages/jobs-explorer";
import { AdminStoragePage } from "./pages/storage";

export function AdminApp() {
  return (
    <ErrorBoundary>
      <BaseProviders>
        <AdminAuthGate>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/+$/, "") || "/"}>
            <AdminShell>
              <Routes>
                <Route path="/" element={<AdminOverviewPage />} />
                <Route path="/financials" element={<ExecutiveBillingPage />} />
                <Route path="/sources" element={<AdminSourcesPage />} />
                <Route path="/expenses" element={<AdminExpensesPage />} />
                <Route path="/job-analytics" element={<AdminJobAnalyticsPage />} />
                <Route path="/jobs" element={<AdminJobsExplorerPage />} />
                <Route path="/storage" element={<AdminStoragePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AdminShell>
          </BrowserRouter>
        </AdminAuthGate>
      </BaseProviders>
    </ErrorBoundary>
  );
}
