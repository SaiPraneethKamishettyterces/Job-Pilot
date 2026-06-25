import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Briefcase, FileText, FileSignature, Mail, Loader2, Copy, Download, ExternalLink, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRelativeDate } from "@/lib/utils";
import { getApplications, getDocuments, generateDocuments, downloadFile, type GeneratedDocument } from "@/services/api";
import type { Application } from "@/types";

type BadgeVariant = "default" | "success" | "warning" | "info" | "secondary" | "destructive" | "outline" | "purple" | "cyan";

// Map the backend status enum onto the product's six display statuses + colors.
const STATUS_DISPLAY: Record<string, { label: string; variant: BadgeVariant }> = {
  APPLIED: { label: "Applied", variant: "success" },
  APPROVED: { label: "Approved", variant: "success" },
  ASSISTED_REQUIRED: { label: "Assisted", variant: "warning" },
  DECLINED: { label: "Declined", variant: "secondary" },
  INTERVIEW: { label: "Interview", variant: "purple" },
  OFFER: { label: "Offer", variant: "cyan" },
};
function statusDisplay(status: string): { label: string; variant: BadgeVariant } {
  // Everything still in flight reads as "Pending" (blue) — one bucket, not 15.
  return STATUS_DISPLAY[status] ?? { label: "Pending", variant: "info" };
}

const DOC_TYPES = [
  { type: "resume" as const, label: "Tailored Resume", icon: FileText },
  { type: "cover_letter" as const, label: "Cover Letter", icon: FileSignature },
  { type: "cold_email" as const, label: "Cold Email", icon: Mail },
];

// Deterministic accent for the company initial-avatar (no logo data in the API).
// ponytail: real logos need a logo service (Clearbit/etc); initials are enough here.
const AVATAR_TINTS = [
  "bg-brand-blue/15 text-brand-blue-soft",
  "bg-brand-purple/15 text-brand-purple-soft",
  "bg-green-500/15 text-green-300 light:text-green-700",
  "bg-amber-500/15 text-amber-300 light:text-amber-700",
  "bg-cyan-500/15 text-cyan-300 light:text-cyan-700",
];
function CompanyLogo({ company }: { company: string }) {
  const initial = company.trim()[0]?.toUpperCase() ?? "?";
  let h = 0;
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) >>> 0;
  return (
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold ${AVATAR_TINTS[h % AVATAR_TINTS.length]}`}>
      {initial}
    </div>
  );
}

function AppliedCard({
  app, docs, onOpenDoc, onGenerate, generating,
}: {
  app: Application;
  docs: GeneratedDocument[];
  onOpenDoc: (d: GeneratedDocument) => void;
  onGenerate: (id: string) => void;
  generating: boolean;
}) {
  const st = statusDisplay(app.status);
  const byType = new Map(docs.map((d) => [d.type, d]));
  const appliedAt = app.appliedAt ?? app.createdAt;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-4">
        {/* Row 1 — identity + status */}
        <div className="flex items-start gap-3">
          <CompanyLogo company={app.company} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{app.roleTitle}</p>
            <p className="truncate text-sm text-muted-foreground">{app.company}</p>
          </div>
          <Badge variant={st.variant} className="shrink-0 rounded-full">{st.label}</Badge>
        </div>

        {/* Row 2 — meta */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>Applied {formatRelativeDate(appliedAt)}</span>
          {app.atsPlatform && (<><span>·</span><span className="capitalize">{app.atsPlatform}</span></>)}
          {app.matchScore != null && (<><span>·</span><span>{app.matchScore}% match</span></>)}
          {app.jobUrl && (
            <>
              <span>·</span>
              <a href={app.jobUrl} target="_blank" rel="noopener noreferrer"
                 aria-label={`Open job posting for ${app.roleTitle} at ${app.company}`}
                 className="inline-flex items-center gap-1 text-primary hover:underline">
                Job posting <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
        </div>

        {/* Row 3 — inline documents */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs font-medium text-muted-foreground">Documents:</span>
          {DOC_TYPES.map(({ type, label, icon: Icon }) => {
            const doc = byType.get(type);
            if (doc) {
              return (
                <button
                  key={type}
                  onClick={() => onOpenDoc(doc)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/15"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" /> {label}
                </button>
              );
            }
            return (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
                title={`${label} not generated yet`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </span>
            );
          })}
          {docs.length < DOC_TYPES.length && (
            <Button
              variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
              onClick={() => onGenerate(app.id)} disabled={generating}
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Generate
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AppliedPage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "ALL");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "company">("newest");
  const [openDoc, setOpenDoc] = useState<GeneratedDocument | null>(null);
  const queryClient = useQueryClient();

  const { data: appsData, isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: () => getApplications(),
    staleTime: 30_000,
  });
  const { data: docsData } = useQuery({
    queryKey: ["documents"],
    queryFn: getDocuments,
    staleTime: 30_000,
  });

  const generate = useMutation({
    mutationFn: generateDocuments,
    onSuccess: () => {
      toast.success("Documents generated");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (e: Error) => toast.error(e.message || "Generation failed"),
  });

  const docsByApp = useMemo(() => {
    const m = new Map<string, GeneratedDocument[]>();
    for (const d of docsData?.documents ?? []) {
      const arr = m.get(d.application.id) ?? [];
      arr.push(d);
      m.set(d.application.id, arr);
    }
    return m;
  }, [docsData]);

  const apps = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = (appsData?.applications ?? []).filter((a) => {
      if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
      if (q && !`${a.company} ${a.roleTitle}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const t = (a: Application) => new Date(a.appliedAt ?? a.createdAt).getTime();
    list = [...list].sort((a, b) =>
      sortBy === "company" ? a.company.localeCompare(b.company)
        : sortBy === "oldest" ? t(a) - t(b) : t(b) - t(a),
    );
    return list;
  }, [appsData, search, statusFilter, sortBy]);

  const download = (url: string, ext: string) => {
    if (!openDoc) return;
    const name = `${openDoc.application.company}_${openDoc.application.roleTitle}.${ext}`.replace(/[^a-z0-9._-]/gi, "_");
    downloadFile(url, name).then(() => toast.success(`Downloaded ${ext.toUpperCase()}`)).catch(() => toast.error("Download failed"));
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Applied Jobs</h2>
        {isLoading ? (
          <Skeleton className="mt-1 h-4 w-32" />
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {apps.length} application{apps.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search company or role…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="APPLIED">Applied</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="ASSISTED_REQUIRED">Assisted</SelectItem>
            <SelectItem value="DECLINED">Declined</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="company">Company A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><div className="flex items-center gap-3"><Skeleton className="h-12 w-12 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-32" /></div></div></CardContent></Card>
          ))}
        </div>
      ) : apps.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Briefcase className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="mb-1 text-sm font-medium">No applications yet</p>
            <p className="text-xs text-muted-foreground">
              {search || statusFilter !== "ALL" ? "Try clearing your filters." : "Apply to jobs from Jobs Found — they'll appear here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => (
            <AppliedCard
              key={app.id}
              app={app}
              docs={docsByApp.get(app.id) ?? []}
              onOpenDoc={setOpenDoc}
              onGenerate={(id) => generate.mutate(id)}
              generating={generate.isPending && generate.variables === app.id}
            />
          ))}
        </div>
      )}

      {/* Document viewer */}
      <Dialog open={Boolean(openDoc)} onOpenChange={(o) => !o && setOpenDoc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {openDoc ? `${DOC_TYPES.find((d) => d.type === openDoc.type)?.label ?? "Document"} — ${openDoc.application.roleTitle}` : ""}
            </DialogTitle>
          </DialogHeader>
          {openDoc && (
            <div className="space-y-3">
              <div className="max-h-[55vh] overflow-y-auto rounded-lg border bg-muted/30 p-4">
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{openDoc.content || "(empty)"}</pre>
              </div>
              <div className="flex justify-end gap-2">
                {openDoc.pdfUrl && <Button variant="outline" size="sm" onClick={() => download(openDoc.pdfUrl!, "pdf")}><Download className="h-4 w-4" /> PDF</Button>}
                {openDoc.docxUrl && <Button variant="outline" size="sm" onClick={() => download(openDoc.docxUrl!, "docx")}><Download className="h-4 w-4" /> DOCX</Button>}
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(openDoc.content ?? "").then(() => toast.success("Copied"))}>
                  <Copy className="h-4 w-4" /> Copy
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
