import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Plus, X, User, Target, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
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

  const add = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput("");
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
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
              >
                <X className="h-2.5 w-2.5" />
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
  const [form, setForm] = useState({
    fullName: profile?.fullName ?? "",
    phone: profile?.phone ?? "",
    location: profile?.location ?? "",
    workAuthorization: profile?.workAuthorization ?? "",
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
        location: profile.location ?? "",
        workAuthorization: profile.workAuthorization ?? "",
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
      location: form.location || undefined,
      workAuthorization: form.workAuthorization || undefined,
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
          <Label htmlFor="fullName">Full Name *</Label>
          <Input id="fullName" value={form.fullName} onChange={set("fullName")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={form.phone} onChange={set("phone")} placeholder="+1 (555) 000-0000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location">Location</Label>
          <Input id="location" value={form.location} onChange={set("location")} placeholder="San Francisco, CA" />
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
          <Label htmlFor="workAuth">Work Authorization</Label>
          <Input
            id="workAuth"
            value={form.workAuthorization}
            onChange={set("workAuthorization")}
            placeholder="US Citizen / H1-B / OPT / EAD…"
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
          <Label>Remote Preference</Label>
          <Select
            value={form.remotePreference}
            onValueChange={(v) => setForm((f) => ({ ...f, remotePreference: v }))}
          >
            <SelectTrigger>
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
          <Label>Approval Mode</Label>
          <Select
            value={form.approvalMode}
            onValueChange={(v) => setForm((f) => ({ ...f, approvalMode: v }))}
          >
            <SelectTrigger>
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

        <TabsContent value="experience" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Work Experience & Education</CardTitle>
              <CardDescription>
                Detailed experience context for document generation (Phase 3).
              </CardDescription>
            </CardHeader>
            <CardContent className="py-10 text-center">
              <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">Coming in Phase 3</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Detailed work history and education will be used to tailor resumes and cover letters.
                Parse your resume on the Resume page to pre-fill this section.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
