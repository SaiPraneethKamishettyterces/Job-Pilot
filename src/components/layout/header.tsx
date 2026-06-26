import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Search, Sun, Moon, Briefcase, CreditCard, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useTheme } from "@/lib/theme";
import { MobileSidebar } from "./sidebar";
import { getActivity, type ActivityEvent } from "@/services/api/activity";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/jobs": "Jobs",
  "/candidates": "Candidates",
  "/applied": "Applied Jobs",
  "/review": "Review Queue",
  "/resume": "Resumes",
  "/profile": "Profile",
  "/analytics": "Analytics",
  "/billing": "Billing",
  "/settings": "Settings",
};

const PAGE_SUBTITLES: Record<string, string> = {
  "/dashboard": "Your job search at a glance",
  "/review": "Approve and submit prepared applications",
  "/applied": "Every job you've applied to",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function NotificationItem({ ev, onNavigate }: { ev: ActivityEvent; onNavigate: () => void }) {
  const Icon = ev.kind === "subscription" ? CreditCard : Briefcase;
  const title = ev.description || ev.type.replace(/_/g, " ");
  const sub = [ev.roleTitle, ev.company].filter(Boolean).join(" · ");
  return (
    <button
      onClick={onNavigate}
      className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium capitalize">{title}</span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(ev.createdAt)}</span>
    </button>
  );
}

export function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const title = PAGE_TITLES[pathname] ?? "JobPilot";
  const subtitle = PAGE_SUBTITLES[pathname];

  const [search, setSearch] = useState("");

  const { data: activityData } = useQuery({
    queryKey: ["activity", "header"],
    queryFn: () => getActivity(8),
    staleTime: 60_000,
  });
  const events = activityData?.events ?? [];

  // Real unseen tracking: compare the newest event to a last-seen timestamp
  // persisted across navigations/reloads (was local-only, so the dot reappeared
  // on every page load). ISO strings compare lexically — same format throughout.
  const newest = events.reduce((m, e) => (e.createdAt > m ? e.createdAt : m), "");
  const [lastSeen, setLastSeen] = useState(() => localStorage.getItem("notif:lastSeen") ?? "");
  const hasUnseen = Boolean(newest) && newest > lastSeen;
  const markSeen = () => {
    if (!newest) return;
    localStorage.setItem("notif:lastSeen", newest);
    setLastSeen(newest);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    navigate(`/applied?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="glass-panel sticky top-0 z-30 flex h-[72px] shrink-0 items-center justify-between border-x-0 border-t-0 px-6 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <MobileSidebar />
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-7 tracking-[-0.02em] sm:text-[22px]">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <form onSubmit={submitSearch} className="relative hidden sm:block">
          <button
            type="submit"
            aria-label="Search applications"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Search className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search applications…"
            className="h-10 w-40 pl-9 md:w-56 lg:w-64"
            aria-label="Search applications"
          />
        </form>

        <Button variant="secondary" size="icon" className="h-10 w-10" onClick={toggle} title="Toggle theme">
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.8} />}
        </Button>

        <Popover onOpenChange={(open) => open && markSeen()}>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="icon" className="relative h-10 w-10" title="Notifications">
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {hasUnseen && (
                <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-blue-bright ring-2 ring-[color:var(--card)]" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-3 py-2.5">
              <p className="text-sm font-semibold">Notifications</p>
              <span className="text-xs text-muted-foreground">{events.length} recent</span>
            </div>
            <div className="max-h-80 overflow-y-auto p-1">
              {events.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No recent activity yet.
                </p>
              ) : (
                events.map((ev) => (
                  <NotificationItem
                    key={ev.id}
                    ev={ev}
                    onNavigate={() => navigate(ev.applicationId ? `/applied?q=${encodeURIComponent(ev.company ?? "")}` : "/applied")}
                  />
                ))
              )}
            </div>
            <div className="border-t p-1">
              <button
                onClick={() => navigate("/applied")}
                className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted/60"
              >
                View applied jobs <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
