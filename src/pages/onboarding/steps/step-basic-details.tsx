import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OnboardingFormData } from "@/types";

interface Props {
  data: OnboardingFormData;
  onChange: (partial: Partial<OnboardingFormData>) => void;
}

const WORK_AUTH_OPTIONS = [
  "US Citizen",
  "Green Card",
  "H-1B (current)",
  "Needs Sponsorship",
  "OPT/CPT",
  "Other",
];

export function StepBasicDetails({ data, onChange }: Props) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name <span className="text-destructive">*</span></Label>
          <Input
            id="fullName"
            placeholder="Alex Johnson"
            value={data.fullName}
            onChange={(e) => onChange({ fullName: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone number</Label>
          <Input
            id="phone"
            placeholder="+1 (555) 000-0000"
            value={data.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="location">Current location</Label>
        <Input
          id="location"
          placeholder="San Francisco, CA"
          value={data.location}
          onChange={(e) => onChange({ location: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Work authorization</Label>
          <Select value={data.workAuthorization} onValueChange={(v) => onChange({ workAuthorization: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {WORK_AUTH_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="yearsExp">Years of experience</Label>
          <Input
            id="yearsExp"
            type="number"
            min={0}
            max={40}
            placeholder="3"
            value={data.yearsExperience}
            onChange={(e) => onChange({ yearsExperience: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="linkedin">LinkedIn URL</Label>
        <Input
          id="linkedin"
          placeholder="https://linkedin.com/in/yourprofile"
          value={data.linkedinUrl}
          onChange={(e) => onChange({ linkedinUrl: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="github">GitHub URL</Label>
          <Input
            id="github"
            placeholder="https://github.com/username"
            value={data.githubUrl}
            onChange={(e) => onChange({ githubUrl: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="portfolio">Portfolio URL</Label>
          <Input
            id="portfolio"
            placeholder="https://yoursite.com"
            value={data.portfolioUrl}
            onChange={(e) => onChange({ portfolioUrl: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
