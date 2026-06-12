import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OnboardingFormData } from "@/types";

interface Props {
  data: OnboardingFormData;
  onChange: (partial: Partial<OnboardingFormData>) => void;
}

export function StepPreferences({ data, onChange }: Props) {
  const [locInput, setLocInput] = useState("");

  const addLocation = () => {
    const v = locInput.trim();
    if (v && !data.locations.includes(v)) {
      onChange({ locations: [...data.locations, v] });
    }
    setLocInput("");
  };

  return (
    <div className="space-y-6">
      {/* Locations */}
      <div className="space-y-2">
        <Label>Preferred locations</Label>
        <p className="text-xs text-muted-foreground">Cities or metros you'd work in</p>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. New York, NY"
            value={locInput}
            onChange={(e) => setLocInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLocation(); } }}
          />
          <Button type="button" variant="outline" size="icon" onClick={addLocation}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {data.locations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.locations.map((loc) => (
              <span key={loc} className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-0.5 text-xs font-medium">
                {loc}
                <button type="button" onClick={() => onChange({ locations: data.locations.filter((l) => l !== loc) })} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Remote preference */}
      <div className="space-y-2">
        <Label>Work mode preference</Label>
        <Select value={data.remotePreference} onValueChange={(v) => onChange({ remotePreference: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Open to anything</SelectItem>
            <SelectItem value="remote">Remote only</SelectItem>
            <SelectItem value="hybrid">Hybrid preferred</SelectItem>
            <SelectItem value="onsite">On-site preferred</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Salary */}
      <div className="space-y-2">
        <Label htmlFor="minSalary">Minimum salary expectation (USD/year)</Label>
        <p className="text-xs text-muted-foreground">Jobs below this threshold will be deprioritised</p>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <Input
            id="minSalary"
            type="number"
            min={0}
            step={5000}
            placeholder="120000"
            className="pl-7"
            value={data.minSalary || ""}
            onChange={(e) => onChange({ minSalary: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}
