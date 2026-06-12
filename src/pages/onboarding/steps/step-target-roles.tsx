import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { OnboardingFormData } from "@/types";

interface Props {
  data: OnboardingFormData;
  onChange: (partial: Partial<OnboardingFormData>) => void;
}

const SUGGESTED_ROLES = [
  "Software Engineer", "Senior Software Engineer", "Full Stack Engineer",
  "Frontend Engineer", "Backend Engineer", "Staff Engineer",
  "Data Engineer", "ML Engineer", "DevOps Engineer", "Product Manager",
];

function TagInput({
  label,
  description,
  values,
  onAdd,
  onRemove,
  placeholder,
  suggestions,
}: {
  label: string;
  description?: string;
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [input, setInput] = useState("");

  const add = (v: string) => {
    const trimmed = v.trim();
    if (trimmed && !values.includes(trimmed)) {
      onAdd(trimmed);
    }
    setInput("");
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(input); }
          }}
        />
        <Button type="button" variant="outline" size="icon" onClick={() => add(input)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-0.5 text-xs font-medium">
              {v}
              <button type="button" onClick={() => onRemove(v)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {suggestions && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Suggestions:</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.filter((s) => !values.includes(s)).slice(0, 6).map((s) => (
              <Badge
                key={s}
                variant="outline"
                className="cursor-pointer hover:bg-accent text-xs"
                onClick={() => add(s)}
              >
                + {s}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function StepTargetRoles({ data, onChange }: Props) {
  return (
    <div className="space-y-6">
      <TagInput
        label="Target job titles"
        description="Add the roles you're actively targeting"
        values={data.targetRoles}
        onAdd={(v) => onChange({ targetRoles: [...data.targetRoles, v] })}
        onRemove={(v) => onChange({ targetRoles: data.targetRoles.filter((r) => r !== v) })}
        placeholder="e.g. Senior Software Engineer"
        suggestions={SUGGESTED_ROLES}
      />

      <TagInput
        label="Target companies (optional)"
        description="Companies you specifically want to work at"
        values={data.targetCompanies}
        onAdd={(v) => onChange({ targetCompanies: [...data.targetCompanies, v] })}
        onRemove={(v) => onChange({ targetCompanies: data.targetCompanies.filter((c) => c !== v) })}
        placeholder="e.g. Stripe, Vercel, Linear"
      />

      <TagInput
        label="Blocked companies (optional)"
        description="Companies you don't want to apply to"
        values={data.blockedCompanies}
        onAdd={(v) => onChange({ blockedCompanies: [...data.blockedCompanies, v] })}
        onRemove={(v) => onChange({ blockedCompanies: data.blockedCompanies.filter((c) => c !== v) })}
        placeholder="e.g. Company name"
      />
    </div>
  );
}
