import { useLocation } from "react-router-dom";
import { Bell, Search, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/jobs": "Jobs",
  "/runs": "Application Runs",
  "/candidates": "Candidates",
  "/applications": "Applications",
  "/review": "Review Queue",
  "/resume": "Resume & Profile",
  "/profile": "Profile",
  "/analytics": "Analytics",
  "/activity": "Activity",
  "/billing": "Billing",
  "/settings": "Settings",
};

const PAGE_SUBTITLES: Record<string, string> = {
  "/dashboard": "Your job search at a glance",
  "/review": "Approve and submit prepared applications",
  "/applications": "Every application JobPilot has prepared",
};

export function Header() {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const title = PAGE_TITLES[pathname] ?? "JobPilot";
  const subtitle = PAGE_SUBTITLES[pathname];

  return (
    <header className="glass-panel sticky top-0 z-30 flex h-[72px] shrink-0 items-center justify-between border-x-0 border-t-0 px-6 md:px-8">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold leading-7 tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2.5">
        <div className="relative hidden lg:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
          <Input placeholder="Search…" className="h-10 w-64 pl-9" />
        </div>

        <Button variant="secondary" size="icon" className="h-10 w-10" onClick={toggle} title="Toggle theme">
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.8} />}
        </Button>

        <Button variant="secondary" size="icon" className="relative h-10 w-10" title="Notifications">
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-blue-bright ring-2 ring-[color:var(--card)]" />
        </Button>
      </div>
    </header>
  );
}
