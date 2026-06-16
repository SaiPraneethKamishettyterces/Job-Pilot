import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Eye, AlertTriangle, FileDown, Send, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BASE } from "@/services/api/client";
import {
  getApplications,
  getApplication,
  approveApplication,
  declineApplication,
  submitApplication,
  generateDocuments,
} from "@/services/api";

// Statuses that belong in the review queue (the user must act on these).
const REVIEW_STATUSES = ["NEEDS_APPROVAL", "ASSISTED_REQUIRED", "GENERATED", "SHORTLISTED"];

function statusBadge(status: string) {
  if (status === "NEEDS_APPROVAL") return { variant: "warning" as const, label: "Needs Approval" };
  if (status === "ASSISTED_REQUIRED") return { variant: "info" as const, label: "Assist Required" };
  if (status === "SHORTLISTED") return { variant: "secondary" as const, label: "Shortlisted" };
  return { variant: "secondary" as const, label: status.replace(/_/g, " ") };
}

export function ReviewPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["applications", "review"],
    queryFn: () => getApplications({ limit: 100 }),
    refetchInterval: 8000, // pipeline runs async — keep the queue fresh
  });

  const queue = useMemo(
    () => (data?.applications ?? []).filter((a) => REVIEW_STATUSES.includes(a.status)),
    [data],
  );

  useEffect(() => {
    if (!selectedId && queue.length) setSelectedId(queue[0]!.id);
  }, [queue, selectedId]);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["application", selectedId],
    queryFn: () => getApplication(selectedId!),
    enabled: Boolean(selectedId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["application", selectedId] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => approveApplication(id),
    onSuccess: () => { toast.success("Approved"); invalidate(); },
    onError: () => toast.error("Could not approve"),
  });
  const decline = useMutation({
    mutationFn: (id: string) => declineApplication(id),
    onSuccess: () => { toast.info("Declined"); setSelectedId(null); invalidate(); },
    onError: () => toast.error("Could not decline"),
  });
  const submit = useMutation({
    mutationFn: (id: string) => submitApplication(id),
    onSuccess: (r) => {
      if (r.status === "APPLIED") toast.success("Application submitted");
      else toast.warning(r.result.reason);
      invalidate();
    },
    onError: () => toast.error("Submission failed"),
  });
  const generate = useMutation({
    mutationFn: (id: string) => generateDocuments(id),
    onSuccess: (r) => { toast.success(`Generated: ${r.documentTypes.join(", ")}`); invalidate(); },
    onError: () => toast.error("Generation failed"),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <CheckCircle className="h-12 w-12 text-success" />
        <h3 className="text-lg font-semibold">All caught up!</h3>
        <p className="text-sm text-muted-foreground">No applications waiting for your review. Start a run to generate more.</p>
      </div>
    );
  }

  const app = detail?.application;
  const pkg = app?.applicationPackage;
  const resumeDoc = app?.documents.find((d) => d.type === "resume");
  const coverDoc = app?.documents.find((d) => d.type === "cover_letter");

  return (
    <div className="flex gap-6 h-full">
      {/* Queue list */}
      <div className="w-72 shrink-0 space-y-2">
        <p className="text-sm text-muted-foreground">{queue.length} waiting</p>
        {queue.map((item) => {
          const b = statusBadge(item.status);
          return (
            <Card
              key={item.id}
              className={`cursor-pointer transition-all ${selectedId === item.id ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
              onClick={() => setSelectedId(item.id)}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{item.company}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.roleTitle}</p>
                  </div>
                  {typeof item.matchScore === "number" && (
                    <Badge variant={item.matchScore >= 80 ? "success" : "warning"} className="shrink-0">
                      {item.matchScore}%
                    </Badge>
                  )}
                </div>
                <Badge variant={b.variant} className="gap-1 text-xs">{b.label}</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detail panel */}
      <div className="flex-1 space-y-4">
        {detailLoading || !app ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{app.company}</CardTitle>
                  <p className="text-muted-foreground">{app.roleTitle}</p>
                </div>
                {typeof app.matchScore === "number" && (
                  <Badge variant={app.matchScore >= 80 ? "success" : "warning"} className="text-base px-3 py-1">
                    {app.matchScore}% match
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Warnings from the autofill package */}
              {pkg?.warnings && pkg.warnings.length > 0 && (
                <div className="rounded-lg bg-warning/10 p-3 space-y-1">
                  {pkg.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />{w}
                    </div>
                  ))}
                </div>
              )}

              {/* Generated documents */}
              {app.documents.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">No documents generated yet.</p>
                  <Button onClick={() => generate.mutate(app.id)} disabled={generate.isPending}>
                    {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Generate documents
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tailored Resume</p>
                      {resumeDoc?.fileUrl && (
                        <a href={`${BASE}${resumeDoc.fileUrl}`} target="_blank" rel="noreferrer"
                           className="text-xs inline-flex items-center gap-1 text-primary hover:underline">
                          <FileDown className="h-3 w-3" /> Download DOCX
                        </a>
                      )}
                    </div>
                    <pre className="rounded-lg border bg-background p-4 text-xs text-muted-foreground max-h-64 overflow-auto whitespace-pre-wrap font-sans">
                      {resumeDoc?.content ?? "—"}
                    </pre>
                  </div>

                  {coverDoc?.content && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Cover Letter</p>
                      <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground whitespace-pre-wrap">
                        {coverDoc.content}
                      </div>
                    </div>
                  )}

                  {app.answers.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Question Answers</p>
                      <div className="space-y-2">
                        {app.answers.map((a) => (
                          <div key={a.id} className="rounded-lg border bg-background p-3 text-sm">
                            <p className="font-medium flex items-center gap-2">
                              {a.question}
                              {a.isSensitive && <Badge variant="destructive" className="text-[10px]">sensitive</Badge>}
                            </p>
                            <p className="text-muted-foreground mt-1">{a.answer || "(needs your input)"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Separator />

              <div className="flex flex-wrap gap-3">
                <Button onClick={() => approve.mutate(app.id)} disabled={approve.isPending} variant="success">
                  <CheckCircle className="h-4 w-4" /> Approve
                </Button>
                <Button onClick={() => submit.mutate(app.id)} disabled={submit.isPending} variant="outline">
                  {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Auto-fill &amp; Submit
                </Button>
                {app.jobUrl && (
                  <a href={app.jobUrl} target="_blank" rel="noreferrer">
                    <Button variant="outline"><Eye className="h-4 w-4" /> Open posting</Button>
                  </a>
                )}
                <Button variant="outline" onClick={() => decline.mutate(app.id)} disabled={decline.isPending}
                        className="text-destructive hover:text-destructive ml-auto">
                  <XCircle className="h-4 w-4" /> Decline
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
