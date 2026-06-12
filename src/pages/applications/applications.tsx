import { useState } from "react";
import { ExternalLink, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelativeDate } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";

const MOCK_APPS: Application[] = [
  { id: "1", userId: "u1", company: "Stripe", roleTitle: "Senior Software Engineer", jobUrl: "https://stripe.com/jobs/1", atsPlatform: "Greenhouse", matchScore: 92, status: "APPLIED", applyMode: "AUTO_APPLY", followUpDate: new Date(Date.now() + 7 * 86400000).toISOString(), createdAt: new Date(Date.now() - 2 * 3600000).toISOString(), updatedAt: new Date().toISOString() },
  { id: "2", userId: "u1", company: "Linear", roleTitle: "Staff Engineer", atsPlatform: "Ashby", matchScore: 88, status: "NEEDS_APPROVAL", createdAt: new Date(Date.now() - 4 * 3600000).toISOString(), updatedAt: new Date().toISOString() },
  { id: "3", userId: "u1", company: "Vercel", roleTitle: "Full Stack Engineer", atsPlatform: "Lever", matchScore: 85, status: "GENERATED", createdAt: new Date(Date.now() - 6 * 3600000).toISOString(), updatedAt: new Date().toISOString() },
  { id: "4", userId: "u1", company: "Notion", roleTitle: "Senior Engineer", atsPlatform: "Greenhouse", matchScore: 79, status: "APPLIED", createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date().toISOString() },
  { id: "5", userId: "u1", company: "Figma", roleTitle: "Frontend Engineer", atsPlatform: "Workday", matchScore: 74, status: "SHORTLISTED", createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date().toISOString() },
  { id: "6", userId: "u1", company: "Discord", roleTitle: "Backend Engineer", atsPlatform: "Lever", matchScore: 81, status: "DECLINED", createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), updatedAt: new Date().toISOString() },
  { id: "7", userId: "u1", company: "Shopify", roleTitle: "Platform Engineer", atsPlatform: "Workday", matchScore: 70, status: "ARCHIVED", createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), updatedAt: new Date().toISOString() },
];

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; variant: "default" | "success" | "warning" | "info" | "secondary" | "destructive" | "outline" }> = {
  DISCOVERED: { label: "Discovered", variant: "secondary" },
  SHORTLISTED: { label: "Shortlisted", variant: "info" },
  GENERATED: { label: "Generated", variant: "info" },
  NEEDS_APPROVAL: { label: "Review", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  APPLIED: { label: "Applied", variant: "success" },
  ASSISTED_REQUIRED: { label: "Assisted", variant: "warning" },
  DRAFT_ONLY: { label: "Draft", variant: "outline" },
  DECLINED: { label: "Declined", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
  ARCHIVED: { label: "Archived", variant: "secondary" },
  FOLLOW_UP_DUE: { label: "Follow Up", variant: "warning" },
};

export function ApplicationsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = MOCK_APPS.filter((a) => {
    const matchesSearch =
      a.company.toLowerCase().includes(search.toLowerCase()) ||
      a.roleTitle.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{MOCK_APPS.length} total applications</p>
        </div>
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company or role…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="APPLIED">Applied</SelectItem>
            <SelectItem value="NEEDS_APPROVAL">Needs Review</SelectItem>
            <SelectItem value="GENERATED">Generated</SelectItem>
            <SelectItem value="SHORTLISTED">Shortlisted</SelectItem>
            <SelectItem value="DECLINED">Declined</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company / Role</TableHead>
              <TableHead>ATS</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Follow-up</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((app) => {
              const statusCfg = STATUS_CONFIG[app.status];
              return (
                <TableRow key={app.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{app.company}</p>
                      <p className="text-xs text-muted-foreground">{app.roleTitle}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{app.atsPlatform ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    {app.matchScore ? (
                      <Badge variant={app.matchScore >= 80 ? "success" : app.matchScore >= 60 ? "warning" : "destructive"}>
                        {app.matchScore}%
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {app.applyMode?.replace("_", " ").toLowerCase() ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{formatRelativeDate(app.createdAt)}</span>
                  </TableCell>
                  <TableCell>
                    {app.followUpDate ? (
                      <span className="text-xs text-warning">{formatRelativeDate(app.followUpDate)}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {app.jobUrl && (
                      <a href={app.jobUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No applications match your filters
          </div>
        )}
      </Card>
    </div>
  );
}
