import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Bot, UserCheck, Eye, FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingFormData } from "@/types";

interface Props {
  data: OnboardingFormData;
  onChange: (partial: Partial<OnboardingFormData>) => void;
}

const APPROVAL_MODES = [
  {
    value: "AUTO_APPLY",
    icon: Bot,
    label: "Auto Apply",
    description: "Apply automatically to simple ATS forms. Pause only for sensitive questions.",
    color: "text-primary",
    bg: "bg-primary/5 border-primary/30",
  },
  {
    value: "ASSISTED_APPLY",
    icon: UserCheck,
    label: "Assisted Apply",
    description: "Prepare applications but let you approve before each submission.",
    color: "text-warning",
    bg: "bg-warning/5 border-warning/30",
  },
  {
    value: "ALWAYS_REVIEW",
    icon: Eye,
    label: "Always Review",
    description: "Queue every application for your review. You decide what gets submitted.",
    color: "text-success",
    bg: "bg-success/5 border-success/30",
  },
  {
    value: "DRAFT_ONLY",
    icon: FileEdit,
    label: "Draft Only",
    description: "Generate tailored documents only. No auto-submission — ever.",
    color: "text-muted-foreground",
    bg: "bg-muted/50 border-border",
  },
];

export function StepApplicationRules({ data, onChange }: Props) {
  return (
    <div className="space-y-6">
      {/* Approval mode */}
      <div className="space-y-3">
        <Label>Application mode</Label>
        <p className="text-xs text-muted-foreground">You can change this anytime from Settings</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {APPROVAL_MODES.map((mode) => (
            <Card
              key={mode.value}
              className={cn(
                "cursor-pointer border transition-all",
                data.approvalMode === mode.value ? mode.bg : "hover:bg-muted/30"
              )}
              onClick={() => onChange({ approvalMode: mode.value })}
            >
              <CardContent className="p-4 space-y-2">
                <div className={cn("flex items-center gap-2", data.approvalMode === mode.value ? mode.color : "text-foreground")}>
                  <mode.icon className="h-4 w-4" />
                  <span className="font-medium text-sm">{mode.label}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{mode.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Applications per day */}
      <div className="space-y-2">
        <Label htmlFor="appsPerDay">Applications per day</Label>
        <p className="text-xs text-muted-foreground">How many applications to attempt in a single run</p>
        <Select
          value={String(data.applicationsPerDay)}
          onValueChange={(v) => onChange({ applicationsPerDay: Number(v) })}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[5, 10, 15, 20, 30, 50].map((n) => (
              <SelectItem key={n} value={String(n)}>{n} per day</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Match threshold */}
      <div className="space-y-2">
        <Label htmlFor="threshold">Minimum match score to apply</Label>
        <p className="text-xs text-muted-foreground">Jobs scoring below this threshold will be skipped</p>
        <div className="flex items-center gap-4">
          <Input
            id="threshold"
            type="range"
            min={50}
            max={95}
            step={5}
            value={data.matchThreshold}
            onChange={(e) => onChange({ matchThreshold: Number(e.target.value) })}
            className="flex-1 h-2 cursor-pointer"
          />
          <span className="text-sm font-semibold w-12 text-right">{data.matchThreshold}%</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Recommended: 70% — catches strong matches while filtering weak fits
        </p>
      </div>
    </div>
  );
}
