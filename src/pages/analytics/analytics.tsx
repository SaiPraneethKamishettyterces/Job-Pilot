import { BarChart2, TrendingUp, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <BarChart2 className="h-4 w-4" />
        <p className="text-sm">Analytics dashboard — coming in MVP 6</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Response Rate", value: "18%", trend: "+3%", icon: TrendingUp },
          { label: "Avg Match Score", value: "81%", trend: "+5%", icon: Activity },
          { label: "Interview Rate", value: "12%", trend: "+2%", icon: BarChart2 },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold">{stat.value}</span>
                <Badge variant="success" className="mb-1">{stat.trend}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: "Jobs Discovered", count: 312, pct: 100 },
              { label: "Shortlisted (≥70%)", count: 89, pct: 29 },
              { label: "Documents Generated", count: 89, pct: 29 },
              { label: "Applications Submitted", count: 67, pct: 21 },
              { label: "Responses Received", count: 12, pct: 4 },
              { label: "Interviews Scheduled", count: 8, pct: 3 },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-52 shrink-0">{row.label}</span>
                <div className="flex-1 bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-12 text-right">{row.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
