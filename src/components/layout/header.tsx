import { useLocation } from "react-router-dom";
import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/runs": "Application Runs",
  "/applications": "Applications",
  "/review": "Review Queue",
  "/resume": "Resume & Profile",
  "/analytics": "Analytics",
  "/billing": "Billing",
  "/settings": "Settings",
};

export function Header() {
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? "JobPilot";

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6 shrink-0">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search…" className="pl-8 w-60 h-9 text-sm" />
        </div>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
        </Button>
      </div>
    </header>
  );
}
