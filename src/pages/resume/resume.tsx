import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, Loader2, Edit, User, Briefcase, GraduationCap, Code, AlertCircle, Mail, FileSignature, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { getProfile, getDocuments, type ProfileResponse, type GeneratedDocument } from "@/services/api";

const DOC_META: Record<GeneratedDocument["type"], { label: string; icon: typeof Mail }> = {
  cover_letter: { label: "Cover Letter", icon: FileSignature },
  cold_email: { label: "Cold Email", icon: Mail },
  resume: { label: "Tailored Resume", icon: FileText },
};

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
  // the apply pipeline, surfaced here so the user can read/copy them.
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: getDocuments,
    staleTime: 30_000,
  });
  const documents = docsData?.documents ?? [];
  const [openDoc, setOpenDoc] = useState<GeneratedDocument | null>(null);

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

  const skills = (profile?.skills ?? []).map((s) => (typeof s === "string" ? s : (s as { name: string }).name));
  const experience = profile?.experience ?? [];
  const education = profile?.education ?? [];
  const hasData = Boolean(profile?.summary || skills.length || experience.length || education.length);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload card */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Resume File
              </CardTitle>
              <CardDescription>Upload a new version to re-parse your profile</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                {...getRootProps()}
                className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                  isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <input {...getInputProps()} />
                {uploadStatus === "uploading" ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                ) : uploadStatus === "error" ? (
                  <AlertCircle className="h-6 w-6 text-destructive mb-2" />
                ) : (
                  <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                )}
                <p className="text-xs text-muted-foreground">
                  {uploadStatus === "uploading" ? "Parsing your resume…" : "Drop or click to upload"}
                </p>
                <p className="text-xs text-muted-foreground">PDF or DOCX · Max 10 MB</p>
              </div>
              <p className="text-xs text-muted-foreground">
                We only fill blank profile fields, so your manual edits are never overwritten.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Profile data */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Parsed Profile</CardTitle>
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
                    Upload your resume on the left — Claude extracts your skills, experience, and
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
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{profile?.fullName || "—"}</span></div>
                      <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{profile?.phone || "—"}</span></div>
                      <div><span className="text-muted-foreground">Location:</span> <span className="font-medium">{profile?.location || "—"}</span></div>
                      <div><span className="text-muted-foreground">LinkedIn:</span> <span className="font-medium truncate">{profile?.linkedinUrl || "—"}</span></div>
                    </div>
                    <Separator />
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {profile?.summary || "No professional summary extracted."}
                    </p>
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
      </div>

      {/* ── Generated Documents ─────────────────────────────────────────────
          Cover letters, cold emails and tailored resumes the apply pipeline
          generated per job. */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              Generated Documents
            </CardTitle>
            {documents.length > 0 && (
              <span className="text-xs text-muted-foreground">{documents.length} document{documents.length === 1 ? "" : "s"}</span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map((doc) => {
                const meta = DOC_META[doc.type];
                const Icon = meta.icon;
                return (
                  <button
                    key={doc.id}
                    onClick={() => setOpenDoc(doc)}
                    className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{meta.label}</Badge>
                      </div>
                      <p className="mt-1 text-sm font-medium truncate">{doc.application.roleTitle}</p>
                      <p className="text-xs text-muted-foreground truncate">{doc.application.company}</p>
                    </div>
                  </button>
                );
              })}
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
          {openDoc && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{openDoc.application.company}</span>
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
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => {
                  navigator.clipboard.writeText(openDoc.content ?? "").then(() => toast.success("Copied to clipboard"));
                }}>
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
