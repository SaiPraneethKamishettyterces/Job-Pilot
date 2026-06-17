import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, Upload, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import type { OnboardingFormData } from "@/types";

interface Props {
  data: OnboardingFormData;
  onChange: (partial: Partial<OnboardingFormData>) => void;
  onParsed: (partial: Partial<OnboardingFormData>) => void;
}

export function StepResumeUpload({ onParsed }: Props) {
  const { token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "parsing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onDrop = useCallback(async (accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setFile(f);
    setStatus("uploading");

    const fd = new FormData();
    fd.append("resume", f);

    try {
      const res = await fetch("/api/resumes/upload-parse", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });

      setStatus("parsing");

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Upload failed");
      }
      const data = await res.json();

      if (data.parsed) {
        onParsed({
          fullName: data.parsed.name ?? "",
          phone: data.parsed.phone ?? "",
          location: data.parsed.location ?? "",
          linkedinUrl: data.parsed.linkedin ?? "",
          githubUrl: data.parsed.github ?? "",
        });
      }

      setStatus("done");
      toast.success("Resume parsed successfully!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to parse resume. You can still continue manually.";
      setStatus("error");
      setErrorMsg(msg);
      toast.error(msg);
    }
  }, [onParsed, token]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  return (
    <div className="space-y-6">
      <div
        {...getRootProps()}
        className={`
          relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors
          ${isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"}
          ${status === "done" ? "border-success bg-success/5" : ""}
          ${status === "error" ? "border-destructive bg-destructive/5" : ""}
        `}
      >
        <input {...getInputProps()} />

        {status === "idle" && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-base font-medium">Drop your resume here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse files</p>
            <p className="text-xs text-muted-foreground mt-3">PDF or DOCX · Max 10 MB</p>
          </>
        )}

        {(status === "uploading" || status === "parsing") && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-base font-medium">
              {status === "uploading" ? "Uploading…" : "Parsing with Claude AI…"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">This takes a few seconds</p>
          </>
        )}

        {status === "done" && (
          <>
            <CheckCircle className="h-10 w-10 text-success mb-4" />
            <p className="text-base font-medium text-success">Resume parsed!</p>
            <p className="text-sm text-muted-foreground mt-1">{file?.name}</p>
            <p className="text-xs text-muted-foreground mt-2">Your profile has been pre-filled from your resume</p>
          </>
        )}

        {status === "error" && (
          <>
            <AlertCircle className="h-10 w-10 text-destructive mb-4" />
            <p className="text-base font-medium text-destructive">Upload failed</p>
            <p className="text-sm text-muted-foreground mt-1">{errorMsg ?? file?.name}</p>
          </>
        )}
      </div>

      {status === "error" && (
        <Button variant="outline" onClick={() => { setStatus("idle"); setErrorMsg(null); }} className="w-full">
          Try again
        </Button>
      )}

      <div className="rounded-lg bg-muted/50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-sm font-medium">What happens to your resume?</p>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1 ml-6">
          <li>Claude extracts your skills, experience, and education</li>
          <li>We keep the extracted text in your account; the uploaded file is discarded after parsing</li>
          <li>You can review and edit everything before proceeding</li>
          <li>We never invent skills or experience you don't have</li>
        </ul>
      </div>
    </div>
  );
}
