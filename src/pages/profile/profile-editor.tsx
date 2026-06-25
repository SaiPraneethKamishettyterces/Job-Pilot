import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Plus, X, User, Target, Briefcase, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { EEO_FIELD_OPTIONS, type EeoOption } from "@/lib/eeo-options";
import {
  getProfile,
  updateProfile,
  updatePreferences,
  type ProfileResponse,
} from "@/services/api";
import type { UserProfile, UserPreference } from "@/types";

// ─── Tag input helper ─────────────────────────────────────────────────────────

function TagInput({
  label,
  tags,
  onChange,
  placeholder,
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const inputId = `tag-input-${label.toLowerCase().replace(/\s+/g, "-")}`;

  const add = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput("");
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={add} aria-label={`Add ${label}`}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 pr-1">
              {t}
              <button
                type="button"
                onClick={() => onChange(tags.filter((x) => x !== t))}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                aria-label={`Remove ${t}`}
              >
                <X className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Personal Info Tab ────────────────────────────────────────────────────────

function PersonalInfoTab({
  profile,
  onSave,
  isSaving,
}: {
  profile: UserProfile | null;
  onSave: (data: Partial<UserProfile>) => void;
  isSaving: boolean;
}) {
  // NOTE: location and workAuthorization are intentionally NOT edited here — they
  // live on the Application Details tab (address parts + sponsorship/visa) to avoid
  // duplicate inputs. candidate-profile derives both from those canonical fields.
  const [form, setForm] = useState({
    fullName: profile?.fullName ?? "",
    phone: profile?.phone ?? "",
    yearsExperience: profile?.yearsExperience?.toString() ?? "",
    linkedinUrl: profile?.linkedinUrl ?? "",
    githubUrl: profile?.githubUrl ?? "",
    portfolioUrl: profile?.portfolioUrl ?? "",
    summary: profile?.summary ?? "",
  });
  const [skills, setSkills] = useState<string[]>(
    (profile?.skills ?? []).map((s) =>
      typeof s === "string" ? s : (s as { name: string }).name
    )
  );

  useEffect(() => {
    if (profile) {
      setForm({
        fullName: profile.fullName ?? "",
        phone: profile.phone ?? "",
        yearsExperience: profile.yearsExperience?.toString() ?? "",
        linkedinUrl: profile.linkedinUrl ?? "",
        githubUrl: profile.githubUrl ?? "",
        portfolioUrl: profile.portfolioUrl ?? "",
        summary: profile.summary ?? "",
      });
      setSkills(
        (profile.skills ?? []).map((s) =>
          typeof s === "string" ? s : (s as { name: string }).name
        )
      );
    }
  }, [profile]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = () => {
    if (!form.fullName.trim()) { toast.error("Full name is required"); return; }
    onSave({
      fullName: form.fullName,
      phone: form.phone || undefined,
      yearsExperience: form.yearsExperience ? parseInt(form.yearsExperience) : undefined,
      linkedinUrl: form.linkedinUrl || undefined,
      githubUrl: form.githubUrl || undefined,
      portfolioUrl: form.portfolioUrl || undefined,
      summary: form.summary || undefined,
      skills: skills.map((name) => ({ name })),
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full Name <span aria-hidden="true">*</span></Label>
          <Input id="fullName" value={form.fullName} onChange={set("fullName")} required aria-required="true" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={form.phone} onChange={set("phone")} placeholder="+1 (555) 000-0000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="yearsExp">Years of Experience</Label>
          <Input
            id="yearsExp"
            type="number"
            min={0}
            max={50}
            value={form.yearsExperience}
            onChange={set("yearsExperience")}
            placeholder="5"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="linkedin">LinkedIn</Label>
          <Input
            id="linkedin"
            value={form.linkedinUrl}
            onChange={set("linkedinUrl")}
            placeholder="https://linkedin.com/in/..."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="github">GitHub</Label>
          <Input
            id="github"
            value={form.githubUrl}
            onChange={set("githubUrl")}
            placeholder="https://github.com/..."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="portfolio">Portfolio</Label>
          <Input
            id="portfolio"
            value={form.portfolioUrl}
            onChange={set("portfolioUrl")}
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="summary">Professional Summary</Label>
        <Textarea
          id="summary"
          value={form.summary}
          onChange={set("summary")}
          placeholder="Brief summary of your background and expertise…"
          rows={4}
          className="resize-none"
        />
      </div>

      <Separator />

      <TagInput
        label="Skills"
        tags={skills}
        onChange={setSkills}
        placeholder="React, TypeScript, Python… (press Enter)"
      />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Profile
        </Button>
      </div>
    </div>
  );
}

// ─── Preferences Tab ──────────────────────────────────────────────────────────

function PreferencesTab({
  preferences,
  onSave,
  isSaving,
}: {
  preferences: UserPreference | null;
  onSave: (data: Partial<UserPreference>) => void;
  isSaving: boolean;
}) {
  const [targetRoles, setTargetRoles] = useState<string[]>(preferences?.targetRoles ?? []);
  const [targetCompanies, setTargetCompanies] = useState<string[]>(preferences?.targetCompanies ?? []);
  const [blockedCompanies, setBlockedCompanies] = useState<string[]>(preferences?.blockedCompanies ?? []);
  const [locations, setLocations] = useState<string[]>(preferences?.locations ?? []);
  const [form, setForm] = useState({
    remotePreference: preferences?.remotePreference ?? "any",
    minSalary: preferences?.minSalary?.toString() ?? "",
    applicationsPerDay: preferences?.applicationsPerDay?.toString() ?? "10",
    approvalMode: preferences?.approvalMode ?? "ALWAYS_REVIEW",
    matchThreshold: preferences?.matchThreshold?.toString() ?? "70",
  });

  useEffect(() => {
    if (preferences) {
      setTargetRoles(preferences.targetRoles ?? []);
      setTargetCompanies(preferences.targetCompanies ?? []);
      setBlockedCompanies(preferences.blockedCompanies ?? []);
      setLocations(preferences.locations ?? []);
      setForm({
        remotePreference: preferences.remotePreference ?? "any",
        minSalary: preferences.minSalary?.toString() ?? "",
        applicationsPerDay: preferences.applicationsPerDay?.toString() ?? "10",
        approvalMode: preferences.approvalMode ?? "ALWAYS_REVIEW",
        matchThreshold: preferences.matchThreshold?.toString() ?? "70",
      });
    }
  }, [preferences]);

  const handleSave = () => {
    onSave({
      targetRoles,
      targetCompanies,
      blockedCompanies,
      locations,
      remotePreference: form.remotePreference as UserPreference["remotePreference"],
      minSalary: form.minSalary ? parseInt(form.minSalary) : undefined,
      applicationsPerDay: form.applicationsPerDay ? parseInt(form.applicationsPerDay) : 10,
      approvalMode: form.approvalMode as UserPreference["approvalMode"],
      matchThreshold: form.matchThreshold ? parseInt(form.matchThreshold) : 70,
    });
  };

  return (
    <div className="space-y-6">
      <TagInput
        label="Target Roles"
        tags={targetRoles}
        onChange={setTargetRoles}
        placeholder="Software Engineer, Staff Engineer… (press Enter)"
      />
      <TagInput
        label="Preferred Locations"
        tags={locations}
        onChange={setLocations}
        placeholder="San Francisco, Remote, New York… (press Enter)"
      />
      <TagInput
        label="Target Companies"
        tags={targetCompanies}
        onChange={setTargetCompanies}
        placeholder="Stripe, Figma, Linear… (press Enter)"
      />
      <TagInput
        label="Blocked Companies"
        tags={blockedCompanies}
        onChange={setBlockedCompanies}
        placeholder="Companies you won't apply to (press Enter)"
      />

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="pref-remote">Remote Preference</Label>
          <Select
            value={form.remotePreference}
            onValueChange={(v) => setForm((f) => ({ ...f, remotePreference: v as typeof f.remotePreference }))}
          >
            <SelectTrigger id="pref-remote">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="remote">Remote only</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
              <SelectItem value="onsite">On-site</SelectItem>
              <SelectItem value="any">Any</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pref-approval">Approval Mode</Label>
          <Select
            value={form.approvalMode}
            onValueChange={(v) => setForm((f) => ({ ...f, approvalMode: v as typeof f.approvalMode }))}
          >
            <SelectTrigger id="pref-approval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AUTO_APPLY">Auto Apply</SelectItem>
              <SelectItem value="ASSISTED_APPLY">Assisted Apply</SelectItem>
              <SelectItem value="ALWAYS_REVIEW">Always Review</SelectItem>
              <SelectItem value="DRAFT_ONLY">Draft Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="minSalary">Minimum Salary (USD/yr)</Label>
          <Input
            id="minSalary"
            type="number"
            min={0}
            value={form.minSalary}
            onChange={(e) => setForm((f) => ({ ...f, minSalary: e.target.value }))}
            placeholder="120000"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="appsPerDay">Applications per Day</Label>
          <Input
            id="appsPerDay"
            type="number"
            min={1}
            max={50}
            value={form.applicationsPerDay}
            onChange={(e) => setForm((f) => ({ ...f, applicationsPerDay: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="threshold">
            Match Threshold: <span className="font-bold text-primary">{form.matchThreshold}%</span>
          </Label>
          <input
            id="threshold"
            type="range"
            min={50}
            max={95}
            step={5}
            value={form.matchThreshold}
            onChange={(e) => setForm((f) => ({ ...f, matchThreshold: e.target.value }))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>50% — more jobs</span>
            <span>95% — fewer, higher quality</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Preferences
        </Button>
      </div>
    </div>
  );
}

// ─── Application Details Tab (generic ATS questions, answered once) ──────────

const GENERIC_TEXT_KEYS = [
  "legalFirstName", "legalLastName", "preferredName",
  "addressLine1", "addressLine2", "city", "state", "zipCode", "country",
  "visaStatus", "currentEmployer", "currentTitle",
  "highestEducation", "school", "degree", "major", "graduationYear",
  "noticePeriod", "availabilityToStart", "desiredSalary", "coverLetterPreference",
  "howHeard", "referralName", "referralSource",
  "gender", "raceEthnicity", "veteranStatus", "disabilityStatus",
] as const;

type GenericTextKey = (typeof GENERIC_TEXT_KEYS)[number];

function triToSelect(v: boolean | undefined): string {
  return v === undefined ? "" : v ? "yes" : "no";
}
function selectToTri(v: string): boolean | undefined {
  return v === "" ? undefined : v === "yes";
}

// Defined at module scope (NOT inside ApplicationDetailsTab). A component declared
// inside another component gets a brand-new identity on every parent render, so
// React unmounts/remounts its <input> on each keystroke — the field loses focus
// after a single character. Hoisting them keeps the input mounted across renders.
function TextField({
  id, label, placeholder, value, onChange,
}: {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// Hoisted (stable identity) dropdown for fixed option lists (e.g. EEO). An empty
// value means "not provided" — rendered as the placeholder.
function SelectField({
  id, label, value, options, placeholder, onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: EeoOption[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}><SelectValue placeholder={placeholder ?? "Select…"} /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function YesNoField({
  label, value, onChange,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (b: boolean | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={triToSelect(value)} onValueChange={(v) => onChange(selectToTri(v))}>
        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ApplicationDetailsTab({
  profile,
  onSave,
  isSaving,
}: {
  profile: UserProfile | null;
  onSave: (data: Partial<UserProfile>) => void;
  isSaving: boolean;
}) {
  const initText = () => {
    const o = {} as Record<GenericTextKey, string>;
    for (const k of GENERIC_TEXT_KEYS) o[k] = (profile?.[k] as string | undefined) ?? "";
    return o;
  };
  const [text, setText] = useState<Record<GenericTextKey, string>>(initText);
  const [requiresSponsorship, setRequiresSponsorship] = useState<boolean | undefined>(profile?.requiresSponsorship);
  const [willingToRelocate, setWillingToRelocate] = useState<boolean | undefined>(profile?.willingToRelocate);
  const [consent, setConsent] = useState<boolean>(Boolean(profile?.consentToDataProcessing));

  useEffect(() => {
    setText(initText());
    setRequiresSponsorship(profile?.requiresSponsorship);
    setWillingToRelocate(profile?.willingToRelocate);
    setConsent(Boolean(profile?.consentToDataProcessing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const set = (k: GenericTextKey) => (v: string) => setText((t) => ({ ...t, [k]: v }));
  // Thin adapter so call sites stay terse; the actual input is the hoisted
  // <TextField> (stable identity → no focus loss). Keep this a plain helper that
  // returns an element, NOT a component, so it never introduces a new type.
  const F = ({ k, label, placeholder }: { k: GenericTextKey; label: string; placeholder?: string }) => (
    <TextField id={k} label={label} placeholder={placeholder} value={text[k]} onChange={set(k)} />
  );

  const handleSave = () => {
    // fullName is required by the profile schema — resend the existing value so
    // this partial save validates without overwriting the Personal Info tab.
    const payload: Partial<UserProfile> = { fullName: profile?.fullName ?? "" };
    for (const k of GENERIC_TEXT_KEYS) {
      (payload as Record<string, unknown>)[k] = text[k].trim() || null;
    }
    payload.requiresSponsorship = requiresSponsorship;
    payload.willingToRelocate = willingToRelocate;
    payload.consentToDataProcessing = consent;
    onSave(payload);
  };

  // Adapter helper, mirrors F. Called as a function ({YesNo({...})}), not <YesNo/>.
  const YesNo = (props: { label: string; value: boolean | undefined; onChange: (b: boolean | undefined) => void }) => (
    <YesNoField {...props} />
  );

  // EEO dropdown adapter — fixed option lists from eeo-options.
  const Sel = ({ k, label }: { k: GenericTextKey; label: string }) => (
    <SelectField id={k} label={label} value={text[k]} options={EEO_FIELD_OPTIONS[k] ?? []} onChange={set(k)} />
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Standard questions most applications ask. Answered once and reused on every
        application. Role-specific questions are handled per application during review.
      </p>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Legal identity</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {F({ k: "legalFirstName", label: "Legal first name" })}
          {F({ k: "legalLastName", label: "Legal last name" })}
          {F({ k: "preferredName", label: "Preferred name" })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address</h3>
        {F({ k: "addressLine1", label: "Street address", placeholder: "123 Main St" })}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {F({ k: "city", label: "City" })}
          {F({ k: "state", label: "State" })}
          {F({ k: "zipCode", label: "ZIP / Postal" })}
          {F({ k: "country", label: "Country" })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Work authorization</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {YesNo({ label: "Require visa sponsorship?", value: requiresSponsorship, onChange: setRequiresSponsorship })}
          {F({ k: "visaStatus", label: "Visa status (if any)", placeholder: "e.g. H-1B, OPT" })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employment &amp; education</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {F({ k: "currentEmployer", label: "Current employer" })}
          {F({ k: "currentTitle", label: "Current title" })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {F({ k: "highestEducation", label: "Highest education", placeholder: "Bachelor's, Master's…" })}
          {F({ k: "school", label: "School / University" })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {F({ k: "degree", label: "Degree" })}
          {F({ k: "major", label: "Major" })}
          {F({ k: "graduationYear", label: "Graduation year" })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Logistics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {YesNo({ label: "Willing to relocate?", value: willingToRelocate, onChange: setWillingToRelocate })}
          {F({ k: "desiredSalary", label: "Desired salary", placeholder: "$120,000" })}
          {F({ k: "noticePeriod", label: "Notice period", placeholder: "2 weeks" })}
          {F({ k: "availabilityToStart", label: "Availability to start", placeholder: "Immediately" })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {F({ k: "howHeard", label: "How did you hear about us? (default)", placeholder: "LinkedIn" })}
          {F({ k: "referralName", label: "Referral name (if any)" })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Voluntary self-identification (EEO)</h3>
        <p className="text-xs text-muted-foreground">
          Optional. If you select a value, it's used to auto-fill the matching EEO question
          on applications (you can always change it). Leave any blank to "Decline to
          self-identify" automatically. Nothing is ever submitted without your review.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Sel({ k: "gender", label: "Gender" })}
          {Sel({ k: "raceEthnicity", label: "Race / ethnicity" })}
          {Sel({ k: "veteranStatus", label: "Veteran status" })}
          {Sel({ k: "disabilityStatus", label: "Disability status" })}
        </div>
      </section>

      <section className="flex items-start gap-3 rounded-lg border p-4">
        <Checkbox id="consent" checked={consent} onCheckedChange={(c) => setConsent(c === true)} />
        <Label htmlFor="consent" className="text-sm font-normal leading-snug">
          I consent to JobPilot storing my details and using them to prepare and assist
          job applications on my behalf.
        </Label>
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Application Details
        </Button>
      </div>
    </div>
  );
}

// ─── Experience (read-only view of parsed resume data) ───────────────────────

function ExperienceTab({ profile }: { profile: UserProfile | null }) {
  const experience = profile?.experience ?? [];
  const education = profile?.education ?? [];
  const projects = profile?.projects ?? [];

  if (!experience.length && !education.length && !projects.length) {
    return (
      <div className="py-10 text-center">
        <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm font-medium mb-1">No experience on file yet</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Upload your resume on the Resume page — Claude extracts your work history,
          education, and projects, and they appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {experience.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Work Experience</h3>
          {experience.map((exp, i) => (
            <div key={i} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{exp.title || "—"}</p>
                  <p className="text-xs text-muted-foreground">{exp.company}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {exp.startDate}{exp.endDate ? ` – ${exp.endDate}` : exp.isCurrent ? " – Present" : ""}
                </span>
              </div>
              {exp.description && <p className="text-xs text-muted-foreground mt-1.5">{exp.description}</p>}
            </div>
          ))}
        </section>
      )}

      {education.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Education</h3>
          {education.map((edu, i) => (
            <div key={i} className="flex items-start justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{edu.degree}{edu.field ? `, ${edu.field}` : ""}</p>
                <p className="text-xs text-muted-foreground">{edu.institution}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {edu.startYear}{edu.endYear ? ` – ${edu.endYear}` : ""}
              </span>
            </div>
          ))}
        </section>
      )}

      {projects.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Projects</h3>
          {projects.map((p, i) => (
            <div key={i} className="rounded-md border p-3">
              <p className="text-sm font-medium">{p.name}</p>
              {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
              {p.technologies && p.technologies.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.technologies.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        This data is extracted from your resume and used to tailor documents. Re-upload your
        resume on the Resume page to refresh it.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ProfileEditorPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<ProfileResponse>({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  const profileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      toast.success("Profile saved");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save profile"),
  });

  const prefsMutation = useMutation({
    mutationFn: updatePreferences,
    onSuccess: () => {
      toast.success("Preferences saved");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save preferences"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Profile</h2>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive mb-1">Failed to load profile</p>
            <p className="text-xs text-muted-foreground">
              Make sure the server is running and DATABASE_URL is configured.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Profile</h2>
        <p className="text-muted-foreground text-sm mt-0.5">
          Keep your profile up to date for better match scoring
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="h-3.5 w-3.5" />
            Profile & Skills
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-1.5">
            <Target className="h-3.5 w-3.5" />
            Job Preferences
          </TabsTrigger>
          <TabsTrigger value="application" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />
            Application Details
          </TabsTrigger>
          <TabsTrigger value="experience" className="gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            Experience
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal Information & Skills</CardTitle>
              <CardDescription>
                This information is used by Claude to score how well you match each job.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PersonalInfoTab
                profile={data?.profile ?? null}
                onSave={(d) => profileMutation.mutate(d)}
                isSaving={profileMutation.isPending}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Job Search Preferences</CardTitle>
              <CardDescription>
                Set your target roles, blocked companies, and auto-apply thresholds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PreferencesTab
                preferences={data?.preferences ?? null}
                onSave={(d) => prefsMutation.mutate(d)}
                isSaving={prefsMutation.isPending}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="application" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Application Details</CardTitle>
              <CardDescription>
                Standard answers reused on every application (Greenhouse, Lever, Ashby, Workable).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ApplicationDetailsTab
                profile={data?.profile ?? null}
                onSave={(d) => profileMutation.mutate(d)}
                isSaving={profileMutation.isPending}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="experience" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Work Experience &amp; Education</CardTitle>
              <CardDescription>
                Extracted from your resume — used to tailor resumes and cover letters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExperienceTab profile={data?.profile ?? null} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
