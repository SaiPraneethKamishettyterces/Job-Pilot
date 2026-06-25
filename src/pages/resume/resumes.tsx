import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { Plus, Loader2, Star, CheckCircle2, MoreHorizontal, Trash2, Upload, AlertCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { formatRelativeDate } from "@/lib/utils";
import { listResumes, setPrimaryResume, deleteResume, type ResumeSummary } from "@/services/api";

function initial(name: string) { return name.trim()[0]?.toUpperCase() ?? "?"; }
const TINTS = ["bg-green-500/15 text-green-300 light:text-green-700", "bg-amber-500/15 text-amber-300 light:text-amber-700", "bg-brand-blue/15 text-brand-blue-soft", "bg-brand-purple/15 text-brand-purple-soft"];
function tint(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return TINTS[h % TINTS.length]; }

function AddResumeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");

  const onDrop = useCallback(async (accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setStatus("uploading");
    const fd = new FormData();
    fd.append("resume", f);
    try {
      const res = await fetch("/api/resumes/upload-parse", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Upload failed");
      await queryClient.invalidateQueries({ queryKey: ["resumes"] });
      setStatus("idle");
      toast.success("Resume added");
      onClose();
    } catch (e) {
      setStatus("error");
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }, [token, queryClient, onClose]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
    maxFiles: 1, maxSize: 10 * 1024 * 1024,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add a resume</DialogTitle></DialogHeader>
        <div {...getRootProps()} className={`flex min-h-[180px] flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"}`}>
          <input {...getInputProps()} />
          {status === "uploading" ? <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
            : status === "error" ? <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
            : <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Upload className="h-6 w-6" /></span>}
          <p className="text-sm font-medium">{status === "uploading" ? "Parsing your resume…" : "Drop or click to upload"}</p>
          <p className="mt-1 text-xs text-muted-foreground">PDF or DOCX · Max 10 MB</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RowMenu({ r, onDelete }: { r: ResumeSummary; onDelete: (r: ResumeSummary) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const primary = useMutation({
    mutationFn: () => setPrimaryResume(r.id),
    onSuccess: () => { toast.success("Set as primary"); queryClient.invalidateQueries({ queryKey: ["resumes"] }); setOpen(false); },
    onError: () => toast.error("Failed to set primary"),
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${r.fileName}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1" onClick={(e) => e.stopPropagation()}>
        {!r.isPrimary && (
          <button onClick={() => primary.mutate()} disabled={primary.isPending} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60">
            <Star className="h-3.5 w-3.5" /> Set as primary
          </button>
        )}
        <button onClick={() => { setOpen(false); onDelete(r); }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive hover:bg-destructive/10">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function ResumesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ResumeSummary | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["resumes"], queryFn: listResumes, staleTime: 30_000 });
  const resumes = data?.resumes ?? [];
  const limit = data?.limit ?? 5;

  const del = useMutation({
    mutationFn: (id: string) => deleteResume(id),
    onSuccess: () => { toast.success("Resume deleted"); queryClient.invalidateQueries({ queryKey: ["resumes"] }); setToDelete(null); },
    onError: () => toast.error("Failed to delete"),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" />
          You have <span className="font-semibold text-foreground">{resumes.length}</span> resume{resumes.length === 1 ? "" : "s"} saved out of {limit} available slots.
        </p>
        <Button onClick={() => setAddOpen(true)} disabled={resumes.length >= limit}>
          <Plus className="h-4 w-4" /> Add Resume
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* header row */}
          <div className="hidden grid-cols-[1fr_180px_140px_140px_44px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Resume</span><span>Target Job Title</span><span>Last Modified</span><span>Created</span><span />
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-4 w-64" /></div>
              ))}
            </div>
          ) : resumes.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="mb-1 text-sm font-medium">No resumes yet</p>
              <p className="mb-4 text-xs text-muted-foreground">Add a resume to start tailoring applications.</p>
              <Button variant="outline" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add your first resume</Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {resumes.map((r) => (
                <div
                  key={r.id}
                  role="button" tabIndex={0}
                  onClick={() => navigate(`/resume/${r.id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter") navigate(`/resume/${r.id}`); }}
                  className="grid cursor-pointer grid-cols-[1fr_44px] items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/40 md:grid-cols-[1fr_180px_140px_140px_44px]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tint(r.fileName)}`}>{initial(r.fileName)}</span>
                    <span className="truncate text-sm font-semibold">{r.fileName}</span>
                    {r.isPrimary && <Badge variant="success" className="shrink-0 gap-1 rounded-full"><Star className="h-3 w-3" /> Primary</Badge>}
                    {r.analysisComplete && <Badge variant="success" className="shrink-0 rounded-full">Analysis Complete</Badge>}
                  </div>
                  <span className="hidden truncate text-sm text-muted-foreground md:block">{r.targetJobTitle || "—"}</span>
                  <span className="hidden text-sm text-muted-foreground md:block">{formatRelativeDate(r.updatedAt)}</span>
                  <span className="hidden text-sm text-muted-foreground md:block">{formatRelativeDate(r.createdAt)}</span>
                  <div className="flex justify-end"><RowMenu r={r} onDelete={setToDelete} /></div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddResumeDialog open={addOpen} onClose={() => setAddOpen(false)} />

      {/* Delete confirm */}
      <Dialog open={Boolean(toDelete)} onOpenChange={(v) => !v && setToDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete resume?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{toDelete?.fileName}</span> will be permanently removed. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setToDelete(null)}>Cancel</Button>
            <Button variant="destructive" disabled={del.isPending} onClick={() => toDelete && del.mutate(toDelete.id)}>
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
