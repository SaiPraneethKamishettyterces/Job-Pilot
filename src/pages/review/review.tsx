import { useState } from "react";
import { CheckCircle, XCircle, Edit, Eye, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ReviewItem {
  id: string;
  company: string;
  role: string;
  matchScore: number;
  reason: string;
  type: "approval" | "sensitive" | "login" | "captcha";
  preview: { resume: string; coverLetter: string };
}

const MOCK_QUEUE: ReviewItem[] = [
  {
    id: "1",
    company: "Linear",
    role: "Staff Engineer",
    matchScore: 88,
    reason: "Awaiting approval before submission",
    type: "approval",
    preview: {
      resume: "Tailored resume emphasizing distributed systems and TypeScript expertise…",
      coverLetter: "Dear Hiring Team, I'm excited to apply for the Staff Engineer role at Linear…",
    },
  },
  {
    id: "2",
    company: "Workday",
    role: "Senior Developer",
    matchScore: 76,
    reason: "Application requires login — please complete manually",
    type: "login",
    preview: { resume: "Tailored for Workday ATS…", coverLetter: "Cover letter ready for review…" },
  },
  {
    id: "3",
    company: "Oracle",
    role: "Cloud Engineer",
    matchScore: 72,
    reason: "Sensitive question: US work authorization and sponsorship status",
    type: "sensitive",
    preview: { resume: "Cloud-focused resume…", coverLetter: "" },
  },
];

const TYPE_CONFIG = {
  approval: { icon: Eye, label: "Needs Approval", variant: "warning" as const },
  sensitive: { icon: AlertTriangle, label: "Sensitive Q&A", variant: "destructive" as const },
  login: { icon: Clock, label: "Login Required", variant: "info" as const },
  captcha: { icon: AlertTriangle, label: "CAPTCHA", variant: "warning" as const },
};

export function ReviewPage() {
  const [queue, setQueue] = useState(MOCK_QUEUE);
  const [selected, setSelected] = useState<ReviewItem | null>(queue[0] ?? null);

  const approve = (id: string) => {
    toast.success("Application approved and queued for submission");
    setQueue((q) => q.filter((i) => i.id !== id));
    setSelected(queue.find((i) => i.id !== id) ?? null);
  };

  const decline = (id: string) => {
    toast.info("Application declined");
    setQueue((q) => q.filter((i) => i.id !== id));
    setSelected(queue.find((i) => i.id !== id) ?? null);
  };

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <CheckCircle className="h-12 w-12 text-success" />
        <h3 className="text-lg font-semibold">All caught up!</h3>
        <p className="text-sm text-muted-foreground">No applications waiting for your review.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Queue list */}
      <div className="w-72 shrink-0 space-y-2">
        <p className="text-sm text-muted-foreground">{queue.length} waiting</p>
        {queue.map((item) => {
          const cfg = TYPE_CONFIG[item.type];
          return (
            <Card
              key={item.id}
              className={`cursor-pointer transition-all ${selected?.id === item.id ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
              onClick={() => setSelected(item)}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{item.company}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.role}</p>
                  </div>
                  <Badge variant={item.matchScore >= 80 ? "success" : "warning"} className="shrink-0">
                    {item.matchScore}%
                  </Badge>
                </div>
                <Badge variant={cfg.variant} className="gap-1 text-xs">
                  <cfg.icon className="h-3 w-3" />
                  {cfg.label}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="flex-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{selected.company}</CardTitle>
                  <p className="text-muted-foreground">{selected.role}</p>
                </div>
                <Badge variant={selected.matchScore >= 80 ? "success" : "warning"} className="text-base px-3 py-1">
                  {selected.matchScore}% match
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 flex items-center gap-2 text-sm">
                {(() => { const cfg = TYPE_CONFIG[selected.type]; return <><cfg.icon className="h-4 w-4 text-warning shrink-0" />{selected.reason}</>; })()}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Tailored Resume Preview</p>
                  <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                    {selected.preview.resume}
                  </div>
                </div>

                {selected.preview.coverLetter && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Cover Letter Preview</p>
                    <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                      {selected.preview.coverLetter}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex gap-3">
                <Button onClick={() => approve(selected.id)} className="flex-1" variant="success">
                  <CheckCircle className="h-4 w-4" />
                  Approve & Submit
                </Button>
                <Button variant="outline" className="flex-1">
                  <Edit className="h-4 w-4" />
                  Edit Documents
                </Button>
                <Button variant="outline" onClick={() => decline(selected.id)} className="text-destructive hover:text-destructive">
                  <XCircle className="h-4 w-4" />
                  Decline
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
