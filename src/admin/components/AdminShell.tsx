import { NavLink } from "react-router-dom";
import { LayoutDashboard, DollarSign, Database, Receipt, BarChart3, LogOut, Activity, Table2, HardDrive } from "lucide-react";
import { TOKEN_KEY } from "@/services/api/client";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/financials", label: "Financials", icon: DollarSign, end: false },
  { to: "/sources", label: "Sources & Scrapers", icon: Database, end: false },
  { to: "/job-analytics", label: "Job Analytics", icon: BarChart3, end: false },
  { to: "/jobs", label: "Job Pool Explorer", icon: Table2, end: false },
  { to: "/expenses", label: "Job-Pulling Expenses", icon: Receipt, end: false },
  { to: "/storage", label: "Storage & Infra", icon: HardDrive, end: false },
];

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
}

// The owner "command center" shell — a dark ops console, deliberately distinct
// from the job-seeker app: left rail navigation + a slim status topbar.
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Left rail */}
      <aside
        className="flex w-60 shrink-0 flex-col border-r"
        style={{ background: "var(--sidebar-bg)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">◆</span>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide">TERCES</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Ops Console</div>
          </div>
        </div>

        <nav className="mt-2 flex flex-col gap-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
                }`
              }
              style={({ isActive }) => (isActive ? { background: "var(--sidebar-active)" } : undefined)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-2 pb-4">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-12 items-center justify-between border-b px-6"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Owner Console</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="metric">live</span>
          </span>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
