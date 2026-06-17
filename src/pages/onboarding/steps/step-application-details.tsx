import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OnboardingFormData } from "@/types";

interface Props {
  data: OnboardingFormData;
  onChange: (partial: Partial<OnboardingFormData>) => void;
}

const YESNO = [
  { v: "yes", b: true },
  { v: "no", b: false },
];

// Collects the GENERIC questions that Greenhouse/Lever/Ashby/Workable ask on
// almost every application, so the user answers them once. Role-specific
// questions are handled per-application later.
export function StepApplicationDetails({ data, onChange }: Props) {
  const Field = ({ id, label, value, placeholder, onSet }: {
    id: string; label: string; value?: string; placeholder?: string; onSet: (v: string) => void;
  }) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} placeholder={placeholder} value={value ?? ""} onChange={(e) => onSet(e.target.value)} />
    </div>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        These are the standard questions most job applications ask. Fill them once
        and we'll reuse them on every application. All optional except consent.
      </p>

      {/* Legal identity */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Legal identity</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field id="legalFirstName" label="Legal first name" value={data.legalFirstName} onSet={(v) => onChange({ legalFirstName: v })} />
          <Field id="legalLastName" label="Legal last name" value={data.legalLastName} onSet={(v) => onChange({ legalLastName: v })} />
          <Field id="preferredName" label="Preferred name" value={data.preferredName} onSet={(v) => onChange({ preferredName: v })} />
        </div>
      </section>

      {/* Address */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Address</h3>
        <Field id="addressLine1" label="Street address" value={data.addressLine1} placeholder="123 Main St" onSet={(v) => onChange({ addressLine1: v })} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field id="city" label="City" value={data.city} onSet={(v) => onChange({ city: v })} />
          <Field id="state" label="State" value={data.state} onSet={(v) => onChange({ state: v })} />
          <Field id="zipCode" label="ZIP / Postal" value={data.zipCode} onSet={(v) => onChange({ zipCode: v })} />
          <Field id="country" label="Country" value={data.country} onSet={(v) => onChange({ country: v })} />
        </div>
        <Field id="personalWebsite" label="Personal website" value={data.personalWebsite} placeholder="https://…" onSet={(v) => onChange({ personalWebsite: v })} />
      </section>

      {/* Work authorization */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Work authorization</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Require visa sponsorship?</Label>
            <Select
              value={data.requiresSponsorship === undefined ? "" : data.requiresSponsorship ? "yes" : "no"}
              onValueChange={(v) => onChange({ requiresSponsorship: YESNO.find((y) => y.v === v)?.b })}
            >
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
            </Select>
          </div>
          <Field id="visaStatus" label="Visa status (if any)" value={data.visaStatus} placeholder="e.g. H-1B, OPT" onSet={(v) => onChange({ visaStatus: v })} />
        </div>
      </section>

      {/* Employment + education */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Employment & education</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="currentEmployer" label="Current employer" value={data.currentEmployer} onSet={(v) => onChange({ currentEmployer: v })} />
          <Field id="currentTitle" label="Current title" value={data.currentTitle} onSet={(v) => onChange({ currentTitle: v })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="highestEducation" label="Highest education" value={data.highestEducation} placeholder="Bachelor's, Master's…" onSet={(v) => onChange({ highestEducation: v })} />
          <Field id="school" label="School / University" value={data.school} onSet={(v) => onChange({ school: v })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field id="degree" label="Degree" value={data.degree} onSet={(v) => onChange({ degree: v })} />
          <Field id="major" label="Major" value={data.major} onSet={(v) => onChange({ major: v })} />
          <Field id="graduationYear" label="Graduation year" value={data.graduationYear} onSet={(v) => onChange({ graduationYear: v })} />
        </div>
      </section>

      {/* Logistics */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Logistics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Willing to relocate?</Label>
            <Select
              value={data.willingToRelocate === undefined ? "" : data.willingToRelocate ? "yes" : "no"}
              onValueChange={(v) => onChange({ willingToRelocate: YESNO.find((y) => y.v === v)?.b })}
            >
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
            </Select>
          </div>
          <Field id="desiredSalary" label="Desired salary" value={data.desiredSalary} placeholder="$120,000" onSet={(v) => onChange({ desiredSalary: v })} />
          <Field id="noticePeriod" label="Notice period" value={data.noticePeriod} placeholder="2 weeks" onSet={(v) => onChange({ noticePeriod: v })} />
          <Field id="availabilityToStart" label="Availability to start" value={data.availabilityToStart} placeholder="Immediately" onSet={(v) => onChange({ availabilityToStart: v })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="howHeard" label="How did you hear about us? (default)" value={data.howHeard} placeholder="LinkedIn" onSet={(v) => onChange({ howHeard: v })} />
          <Field id="referralName" label="Referral name (if any)" value={data.referralName} onSet={(v) => onChange({ referralName: v })} />
        </div>
      </section>

      {/* EEO (voluntary) */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Voluntary self-identification (EEO)</h3>
        <p className="text-xs text-muted-foreground">Optional. Stored only if you provide it; never auto-submitted without your review.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field id="gender" label="Gender" value={data.gender} onSet={(v) => onChange({ gender: v })} />
          <Field id="raceEthnicity" label="Race / ethnicity" value={data.raceEthnicity} onSet={(v) => onChange({ raceEthnicity: v })} />
          <Field id="veteranStatus" label="Veteran status" value={data.veteranStatus} onSet={(v) => onChange({ veteranStatus: v })} />
          <Field id="disabilityStatus" label="Disability status" value={data.disabilityStatus} onSet={(v) => onChange({ disabilityStatus: v })} />
        </div>
      </section>

      {/* Consent */}
      <section className="flex items-start gap-3 rounded-lg border p-4">
        <Checkbox
          id="consent"
          checked={Boolean(data.consentToDataProcessing)}
          onCheckedChange={(c) => onChange({ consentToDataProcessing: c === true })}
        />
        <Label htmlFor="consent" className="text-sm font-normal leading-snug">
          I consent to JobPilot storing my details and using them to prepare and assist
          job applications on my behalf. <span className="text-destructive">*</span>
        </Label>
      </section>
    </div>
  );
}
