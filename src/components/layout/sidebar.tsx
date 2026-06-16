import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Play,
  CheckSquare,
  BarChart2,
  CreditCard,
  Settings,
  LogOut,
  Sparkles,
  Search,
  Database,
  UserCircle,
  HelpCircle,
  Mail,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/jobs", icon: Search, label: "Jobs" },
  { to: "/runs", icon: Play, label: "Runs" },
  { to: "/candidates", icon: Database, label: "Candidates" },
  { to: "/applications", icon: Briefcase, label: "Applications" },
  { to: "/review", icon: CheckSquare, label: "Review Queue" },
  { to: "/resume", icon: FileText, label: "Resume" },
  { to: "/profile", icon: UserCircle, label: "Profile" },
  { to: "/analytics", icon: BarChart2, label: "Analytics" },
  { to: "/activity", icon: Activity, label: "Activity" },
];

const secondaryNav = [
  { to: "/billing", icon: CreditCard, label: "Billing" },
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/help", icon: HelpCircle, label: "Help Center" },
  { to: "/contact", icon: Mail, label: "Contact Us" },
];

function NavRow({ to, icon: Icon, label }: { to: string; icon: typeof Play; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "group flex h-[42px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-[background,color] duration-150",
          isActive
            ? "border border-border bg-[image:var(--sidebar-active)] text-foreground shadow-[0_8px_24px_-12px_rgba(37,99,235,0.5)]"
            : "border border-transparent text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-brand-blue-soft" : "text-muted-foreground group-hover:text-foreground")}
            strokeWidth={1.8}
          />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside className="hidden md:flex h-screen w-[260px] shrink-0 flex-col border-r border-border bg-[color:var(--sidebar-bg)]">
      {/* Brand */}
      <div className="flex h-[72px] items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary shadow-[0_8px_20px_-6px_rgba(37,99,235,0.6)]">
          <Sparkles className="h-[18px] w-[18px] text-white" strokeWidth={1.8} />
        </div>
        <div className="leading-tight">
          <p className="text-[15px] font-bold tracking-tight">JobPilot</p>
          <p className="text-[11px] font-medium text-muted-foreground">Career Copilot</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3.5 py-3 space-y-1">
        <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          Workspace
        </p>
        {navItems.map((item) => (
          <NavRow key={item.to} {...item} />
        ))}

        <p className="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          Account
        </p>
        {secondaryNav.map((item) => (
          <NavRow key={item.to} {...item} />
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-xl border border-transparent p-2 transition-colors hover:border-border hover:bg-foreground/[0.04]">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user?.avatarUrl} />
            <AvatarFallback className="bg-foreground/[0.08] text-xs font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.name ?? "User"}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleLogout}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
