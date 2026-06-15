import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { BarChart2, ShieldCheck } from "lucide-react";
import { BaseProviders } from "@/app/providers";
import { ErrorBoundary } from "@/components/error-boundary";
import { ExecutiveBillingPage } from "./pages/billing";

function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b px-6 py-3 flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm">Terces Admin</span>
        <span className="text-muted-foreground text-xs">— Internal only</span>
        <nav className="ml-6 flex gap-1">
          <NavLink
            to="/billing"
            className={({ isActive }) =>
              `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`
            }
          >
            <BarChart2 className="h-4 w-4" />
            Billing Dashboard
          </NavLink>
        </nav>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

export function AdminApp() {
  return (
    <ErrorBoundary>
      <BaseProviders>
        <BrowserRouter>
          <AdminLayout>
            <Routes>
              <Route path="/billing" element={<ExecutiveBillingPage />} />
              <Route path="*" element={<Navigate to="/billing" replace />} />
            </Routes>
          </AdminLayout>
        </BrowserRouter>
      </BaseProviders>
    </ErrorBoundary>
  );
}
