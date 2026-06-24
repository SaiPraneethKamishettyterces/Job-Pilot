import { useState, useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, Loader2, Edit, User, Briefcase, GraduationCap, Code, AlertCircle,
  Mail, FileSignature, Copy, ExternalLink, Download, Search, Plus, ArrowRight, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { getProfile, getDocuments, downloadFile, updateProfile, type ProfileResponse, type GeneratedDocument } from "@/services/api";

const DOC_META: Record<GeneratedDocument["type"], { label: string; icon: typeof Mail }> = {
  cover_letter: { label: "Cover Letter", icon: FileSignature },
  cold_email: { label: "Cold Email", icon: Mail },
  resume: { label: "Tailored Resume", icon: FileText },
};

// Within a job group, show documents in a stable, meaningful order.
const DOC_ORDER: Record<GeneratedDocument["type"], number> = { resume: 0, cover_letter: 1, cold_email: 2 };

type BadgeVariant = "default" | "success" | "warning" | "info" | "secondary" | "destructive" | "outline";

// Compact application-status → badge map so each document group shows whether it
// was actually applied / still needs review / failed, linking docs back to outcomes.
const DOC_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  APPLIED: { label: "Applied", variant: "success" },
  APPROVED: { label: "Approved", variant: "success" },
  NEEDS_APPROVAL: { label: "Needs review", variant: "warning" },
  QUESTION_NEEDS_REVIEW: { label: "Needs review", variant: "warning" },
  READY_FOR_USER_SUBMIT: { label: "Ready to submit", variant: "warning" },
  FORM_FILLED_READY_TO_SUBMIT: { label: "Ready to submit", variant: "warning" },
  ASSISTED_REQUIRED: { label: "Assisted", variant: "warning" },
  FOLLOW_UP_DUE: { label: "Follow up", variant: "warning" },
  GENERATED: { label: "Generated", variant: "info" },
  TAILORED_RESUME_READY: { label: "Resume ready", variant: "info" },
  SHORTLISTED: { label: "Shortlisted", variant: "info" },
  MATCHED: { label: "Matched", variant: "info" },
  FAILED: { label: "Failed", variant: "destructive" },
  FAILED_TECHNICAL: { label: "Failed", variant: "destructive" },
  DECLINED: { label: "Declined", variant: "secondary" },
  ARCHIVED: { label: "Archived", variant: "secondary" },
  DRAFT_ONLY: { label: "Draft", variant: "outline" },
};
function statusBadge(status: string): { label: string; variant: BadgeVariant } {
  return DOC_STATUS[status] ?? { label: status.replace(/_/g, " ").toLowerCase(), variant: "secondary" };
}

interface DocGroup {
  app: GeneratedDocument["application"];
  docs: GeneratedDocument[];
  latest: number;
}

export function ResumePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");

  const { data, isLoading } = useQuery<ProfileResponse>({
    queryKey: ["profile"],
    queryFn: getProfile,
  });
  const profile = data?.profile ?? null;

  // Generated documents (cover letters, cold emails, tailored resumes) produced by
  // the apply pipeline, surfaced here so the user can read/copy/download them.
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: getDocuments,
    staleTime: 30_000,
  });
  const documents = docsData?.documents ?? [];
  const [openDoc, setOpenDoc] = useState<GeneratedDocument | null>(null);

  // ── Inline summary editor ──────────────────────────────────────────────────
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const summaryMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      toast.success("Summary saved");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setEditingSummary(false);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save summary"),
  });
  const saveSummary = () => {
    const summary = summaryDraft.trim();
    if (!summary) return;
    summaryMutation.mutate({ fullName: profile?.fullName ?? "", summary });
  };

  // ── Document filtering / sorting / grouping ─────────────────────────────────
  const [docQuery, setDocQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | GeneratedDocument["type"]>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "company">("newest");

  const groups = useMemo<DocGroup[]>(() => {
    const q = docQuery.trim().toLowerCase();
    const map = new Map<string, DocGroup>();
    for (const d of documents) {
      if (typeFilter !== "all" && d.type !== typeFilter) continue;
      if (q && !`${d.application.company} ${d.application.roleTitle}`.toLowerCase().includes(q)) continue;
      const key = d.application.id;
      let g = map.get(key);
      if (!g) { g = { app: d.application, docs: [], latest: 0 }; map.set(key, g); }
      g.docs.push(d);
      const t = new Date(d.createdAt).getTime();
      if (t > g.latest) g.latest = t;
    }
    const arr = [...map.values()];
    arr.forEach((g) => g.docs.sort((a, b) => DOC_ORDER[a.type] - DOC_ORDER[b.type]));
    arr.sort((a, b) => {
      if (sortBy === "company") return a.app.company.localeCompare(b.app.company);
      return sortBy === "oldest" ? a.latest - b.latest : b.latest - a.latest;
    });
    return arr;
  }, [documents, docQuery, typeFilter, sortBy]);

  const onDrop = useCallback(async (accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setUploadStatus("uploading");
    const fd = new FormData();
    fd.append("resume", f);
    try {
      const res = await fetch("/api/resumes/upload-parse", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || "Upload failed");
      }
      const body = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      setUploadStatus("idle");
      const filled = (body.autoPopulatedFields as string[] | undefined)?.length ?? 0;
      toast.success(
        body.parsed
          ? `Resume parsed${filled ? ` — pre-filled ${filled} profile field${filled === 1 ? "" : "s"}` : ""}!`
          : "Resume saved (AI parsing unavailable)",
      );
    } catch (err) {
      setUploadStatus("error");
      toast.error(err instanceof Error ? err.message : "Upload failed. Please try again.");
    }
  }, [token, queryClient]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  // Download a tailored-resume artifact (PDF/DOCX) with a clean filename.
  const download = (url: string, ext: string) => {
    if (!openDoc) return;
    const name = `${openDoc.application.company}_${openDoc.application.roleTitle}_resume.${ext}`.replace(/[^a-z0-9._-]/gi, "_");
    downloadFile(url, name)
      .then(() => toast.success(`Resume ${ext.toUpperCase()} downloaded`))
      .catch(() => toast.error("Download failed"));
  };

  const skills = (profile?.skills ?? []).map((s) => (typeof s === "string" ? s : (s as { name: string }).name));
  const experience = profile?.experience ?? [];
  const education = profile?.education ?? [];
  const hasData = Boolean(profile?.summary || skills.length || experience.length || education.length);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Parsed Profile — primary anchor (visually dominant) ───────────── */}
        <div className="order-1 lg:col-span-2">
          <Card className="h-full border-primary/20 bg-gradient-to-b from-primary/[0.05] to-transparent shadow-[0_10px_40px_-16px_rgba(37,99,235,0.3)]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <User className="h-4 w-4" />
                  </span>
                  Parsed Profile
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => navigate("/profile")}>
                  <Edit className="h-4 w-4" />
                  Edit Profile
                </Button>
              </div>
              <CardDescription>Extracted from your resume by AI — review before running</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !hasData ? (
                <div className="py-12 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">No resume data yet</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Upload your resume on the right — Claude extracts your skills, experience, and
                    education and they appear here.
                  </p>
                </div>
              ) : (
                <Tabs defaultValue="summary">
                  <TabsList className="mb-4">
                    <TabsTrigger value="summary" className="gap-1.5"><User className="h-3.5 w-3.5" />Summary</TabsTrigger>
                    <TabsTrigger value="experience" className="gap-1.5"><Briefcase className="h-3.5 w-3.5" />Experience</TabsTrigger>
                    <TabsTrigger value="education" className="gap-1.5"><GraduationCap className="h-3.5 w-3.5" />Education</TabsTrigger>
                    <TabsTrigger value="skills" className="gap-1.5"><Code className="h-3.5 w-3.5" />Skills</TabsTrigger>
                  </TabsList>

                  <TabsContent value="summary" className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div className="flex min-w-0 gap-2"><span className="shrink-0 text-muted-foreground">Name:</span> <span className="truncate font-medium">{profile?.fullName || "—"}</span></div>
                      <div className="flex min-w-0 gap-2"><span className="shrink-0 text-muted-foreground">Phone:</span> <span className="truncate font-medium">{profile?.phone || "—"}</span></div>
                      <div className="flex min-w-0 gap-2"><span className="shrink-0 text-muted-foreground">Location:</span> <span className="truncate font-medium">{profile?.location || "—"}</span></div>
                      <div className="flex min-w-0 gap-2">
                        <span className="shrink-0 text-muted-foreground">LinkedIn:</span>
                        {profile?.linkedinUrl ? (
                          <a
                            href={profile.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            View profile <ArrowRight className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="font-medium">—</span>
                        )}
                      </div>
                    </div>
                    <Separator />

                    {editingSummary ? (
                      <div className="space-y-2">
                        <Textarea
                          autoFocus
                          rows={5}
                          value={summaryDraft}
                          onChange={(e) => setSummaryDraft(e.target.value)}
                          placeholder="e.g. Senior data engineer with 6 years building large-scale pipelines…"
                          className="resize-none"
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setEditingSummary(false)}>Cancel</Button>
                          <Button size="sm" disabled={summaryMutation.isPending || !summaryDraft.trim()} onClick={saveSummary}>
                            {summaryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Save summary
                          </Button>
                        </div>
                      </div>
                    ) : profile?.summary ? (
                      <div className="space-y-1.5">
                        <p className="text-sm leading-relaxed text-muted-foreground">{profile.summary}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={() => { setSummaryDraft(profile.summary ?? ""); setEditingSummary(true); }}
                        >
                          <Edit className="h-3.5 w-3.5" /> Edit summary
                        </Button>
                      </div>
                    ) : (
                      // Actionable empty state — not a dead end. Inline add, right here.
                      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] p-4">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <AlertCircle className="h-4 w-4" />
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-medium">No professional summary yet</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              A summary sharpens match scoring and tailored documents. Add one inline now,
                              or upload a resume to extract it automatically.
                            </p>
                            <Button size="sm" className="mt-3" onClick={() => { setSummaryDraft(""); setEditingSummary(true); }}>
                              <Plus className="h-4 w-4" /> Add a summary
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="experience" className="space-y-4">
                    {experience.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No experience extracted.</p>
                    ) : experience.map((exp, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{exp.title || "—"}</p>
                            <p className="text-xs text-muted-foreground">{exp.company}</p>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {exp.startDate}{exp.endDate ? ` – ${exp.endDate}` : exp.isCurrent ? " – Present" : ""}
                          </span>
                        </div>
                        {exp.description && <p className="text-xs text-muted-foreground">{exp.description}</p>}
                        {i < experience.length - 1 && <Separator className="mt-3" />}
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="education" className="space-y-3">
                    {education.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No education extracted.</p>
                    ) : education.map((edu, i) => (
                      <div key={i} className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">{edu.degree}{edu.field ? `, ${edu.field}` : ""}</p>
                          <p className="text-xs text-muted-foreground">{edu.institution}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{edu.endYear || edu.startYear || ""}</span>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="skills">
                    {skills.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No skills extracted.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {skills.map((skill) => <Badge key={skill} variant="secondary">{skill}</Badge>)}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Upload card — secondary ──────────────────────────────────────── */}
        <div className="order-2 lg:col-span-1">
          <Card className="h-full bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Resume File
              </CardTitle>
              <CardDescription>Upload a new version to re-parse your profile</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Reassurance up top, where it's actually read. */}
              <div className="flex items-start gap-2 rounded-md bg-primary/[0.06] px-3 py-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>We only fill <span className="font-medium text-foreground">blank</span> profile fields — your manual edits are never overwritten.</span>
              </div>
              <div
                {...getRootProps()}
                className={`flex min-h-[200px] flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                  isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"
                }`}
              >
                <input {...getInputProps()} />
                {uploadStatus === "uploading" ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                ) : uploadStatus === "error" ? (
                  <AlertCircle className="h-8 w-8 text-destructive mb-3" />
                ) : (
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Upload className="h-6 w-6" />
                  </span>
                )}
                <p className="text-sm font-medium">
                  {uploadStatus === "uploading" ? "Parsing your resume…" : "Drop or click to upload"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">PDF or DOCX · Max 10 MB</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Generated Documents ─────────────────────────────────────────────
          Cover letters, cold emails and tailored resumes the apply pipeline
          generated per job — grouped by application, filterable and sortable. */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              Generated Documents
            </CardTitle>
            {documents.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {groups.length} job{groups.length === 1 ? "" : "s"} · {documents.length} document{documents.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <CardDescription>Cover letters, cold emails and tailored resumes created for each job application</CardDescription>
        </CardHeader>
        <CardContent>
          {docsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <div className="py-10 text-center">
              <FileSignature className="h-9 w-9 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">No documents yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Start a run and generate applications — tailored resumes, cover letters and cold emails appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Filters: search + type + sort */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filter by company or role…"
                    className="pl-8"
                    value={docQuery}
                    onChange={(e) => setDocQuery(e.target.value)}
                  />
                </div>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
                  <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="resume">Tailored Resume</SelectItem>
                    <SelectItem value="cover_letter">Cover Letter</SelectItem>
                    <SelectItem value="cold_email">Cold Email</SelectItem>
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

              {groups.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm font-medium mb-1">No documents match your filters</p>
                  <p className="text-xs text-muted-foreground">Try a different search term or type.</p>
                </div>
              ) : (
                // Grouped by job: company + role header, then its documents underneath —
                // related docs stay together instead of splitting across columns.
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {groups.map((g) => {
                    const st = statusBadge(g.app.status);
                    return (
                      <div key={g.app.id} className="overflow-hidden rounded-lg border">
                        <div className="flex items-start justify-between gap-3 border-b bg-muted/30 px-4 py-2.5">
                          <div className="min-w-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="truncate text-sm font-semibold">{g.app.roleTitle}</p>
                              </TooltipTrigger>
                              <TooltipContent>{g.app.roleTitle}</TooltipContent>
                            </Tooltip>
                            <p className="truncate text-xs text-muted-foreground">{g.app.company}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                            {g.app.jobUrl && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={g.app.jobUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>Open job posting</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 p-3">
                          {g.docs.map((doc) => {
                            const meta = DOC_META[doc.type];
                            const Icon = meta.icon;
                            return (
                              <button
                                key={doc.id}
                                onClick={() => setOpenDoc(doc)}
                                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-muted/50"
                              >
                                <Icon className="h-3.5 w-3.5 text-primary" />
                                {meta.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document viewer */}
      <Dialog open={Boolean(openDoc)} onOpenChange={(o) => !o && setOpenDoc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {openDoc && (() => { const I = DOC_META[openDoc.type].icon; return <I className="h-4 w-4" />; })()}
              {openDoc ? `${DOC_META[openDoc.type].label} — ${openDoc.application.roleTitle}` : ""}
            </DialogTitle>
          </DialogHeader>
          {openDoc && (() => {
            const st = statusBadge(openDoc.application.status);
            return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{openDoc.application.company}</span>
                  <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                  <button
                    onClick={() => { const company = openDoc.application.company; setOpenDoc(null); navigate(`/applications?q=${encodeURIComponent(company)}`); }}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    View application <ArrowRight className="h-3 w-3" />
                  </button>
                  {openDoc.application.jobUrl && (
                    <a href={openDoc.application.jobUrl} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Job posting
                    </a>
                  )}
                </div>
                <div className="max-h-[55vh] overflow-y-auto rounded-lg border bg-muted/30 p-4">
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{openDoc.content || "(empty)"}</pre>
                </div>
                <div className="flex justify-end gap-2">
                  {openDoc.pdfUrl && (
                    <Button variant="outline" size="sm" onClick={() => download(openDoc.pdfUrl!, "pdf")}>
                      <Download className="h-4 w-4" /> PDF
                    </Button>
                  )}
                  {openDoc.docxUrl && (
                    <Button variant="outline" size="sm" onClick={() => download(openDoc.docxUrl!, "docx")}>
                      <Download className="h-4 w-4" /> DOCX
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => {
                    navigator.clipboard.writeText(openDoc.content ?? "").then(() => toast.success("Copied to clipboard"));
                  }}>
                    <Copy className="h-4 w-4" /> Copy
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
