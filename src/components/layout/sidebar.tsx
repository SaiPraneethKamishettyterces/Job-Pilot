import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  BarChart2,
  CreditCard,
  Settings,
  LogOut,
  Sparkles,
  Search,
  UserCircle,
  HelpCircle,
  Mail,
  Link2,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

// Grouped by task, not a flat list of 10 — so "where is X" is answerable. Five
// items used to read as the same thing (Runs/Applications/Review/Activity/Analytics);
// the section headers now separate "what's running" from "what happened".
type NavItem = { to: string; icon: typeof LayoutDashboard; label: string };
const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/analytics", icon: BarChart2, label: "Analytics" },
    ],
  },
  {
    title: "Pipeline",
    items: [
      { to: "/jobs", icon: Search, label: "Jobs Found" },
      { to: "/applied", icon: Briefcase, label: "Applied" },
      { to: "/apply-link", icon: Link2, label: "Apply with a Link" },
    ],
  },
  {
    title: "You",
    items: [
      { to: "/resume", icon: FileText, label: "Resume" },
      { to: "/profile", icon: UserCircle, label: "Profile" },
    ],
  },
  {
    title: "Account",
    items: [
      { to: "/billing", icon: CreditCard, label: "Billing" },
      { to: "/settings", icon: Settings, label: "Settings" },
      { to: "/help", icon: HelpCircle, label: "Help Center" },
      { to: "/contact", icon: Mail, label: "Contact Us" },
    ],
  },
];

function NavRow({ to, icon: Icon, label, onNavigate }: NavItem & { onNavigate?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          // h-11 = 44px → meets touch-target minimum on mobile.
          "group flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-[background,color] duration-150",
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

// Shared inner content — used by both the desktop rail and the mobile drawer.
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  const handleLogout = () => {
    onNavigate?.();
    logout();
    navigate("/login");
  };

  return (
    <>
      {/* Brand */}
      <div className="flex h-[72px] items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary shadow-[0_8px_20px_-6px_rgba(37,99,235,0.6)]">
          <Sparkles className="h-[18px] w-[18px] text-white" strokeWidth={1.8} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold tracking-tight">JobPilot</p>
          <p className="text-xs font-medium text-muted-foreground">Career Copilot</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3.5 py-3 space-y-1">
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.title} className={i > 0 ? "pt-4" : undefined}>
            <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {section.title}
            </p>
            {section.items.map((item) => (
              <NavRow key={item.to} {...item} onNavigate={onNavigate} />
            ))}
          </div>
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
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleLogout} title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

// Desktop rail — visible ≥ md (adaptive-navigation: sidebar on large screens).
export function Sidebar() {
  return (
    <aside className="hidden md:flex h-screen w-[260px] shrink-0 flex-col border-r border-border bg-[color:var(--sidebar-bg)]">
      <SidebarContent />
    </aside>
  );
}

// Mobile drawer — hamburger trigger + slide-in panel, < md only. The app had NO
// navigation below 768px before this.
export function MobileSidebar() {
  const [open, setOpen] = useState(false);

  // Escape to close + lock body scroll while open (escape-routes).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <Button
        variant="secondary"
        size="icon"
        className="h-10 w-10 md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </Button>

      {/* Overlay — kept mounted so it can transition; pointer-events gated on open. */}
      <div className={cn("fixed inset-0 z-50 md:hidden", !open && "pointer-events-none")} aria-hidden={!open}>
        {/* Scrim (50% — strong enough to isolate the drawer). */}
        <div
          onClick={() => setOpen(false)}
          className={cn("absolute inset-0 bg-black/50 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
        />
        {/* Panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={cn(
            "absolute left-0 top-0 flex h-full w-[280px] max-w-[85vw] flex-col bg-[color:var(--sidebar-bg)] shadow-panel transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-4 h-9 w-9"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
          >
            <X className="h-[18px] w-[18px]" />
          </Button>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </div>
      </div>
    </>
  );
}
