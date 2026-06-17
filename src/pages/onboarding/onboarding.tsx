import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StepBasicDetails } from "./steps/step-basic-details";
import { StepApplicationDetails } from "./steps/step-application-details";
import { StepResumeUpload } from "./steps/step-resume-upload";
import { StepTargetRoles } from "./steps/step-target-roles";
import { StepPreferences } from "./steps/step-preferences";
import { StepApplicationRules } from "./steps/step-application-rules";
import type { OnboardingFormData } from "@/types";

const STEPS = [
  { label: "Basic Details", description: "Tell us about yourself" },
  { label: "Application Details", description: "Standard questions, answered once" },
  { label: "Resume", description: "Upload your resume" },
  { label: "Target Roles", description: "What are you looking for?" },
  { label: "Preferences", description: "Location and salary" },
  { label: "Apply Rules", description: "How should we apply?" },
];

const DEFAULT_DATA: OnboardingFormData = {
  fullName: "",
  phone: "",
  location: "",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  workAuthorization: "US Citizen",
  yearsExperience: 3,
  targetRoles: [],
  targetCompanies: [],
  blockedCompanies: [],
  locations: [],
  remotePreference: "any",
  minSalary: 0,
  applicationsPerDay: 10,
  approvalMode: "ALWAYS_REVIEW",
  matchThreshold: 70,
};

export function OnboardingPage() {
  const navigate = useNavigate();
  const { token, user, markOnboardingDone } = useAuth();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<OnboardingFormData>(DEFAULT_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already completed — skip straight to dashboard (effect, not during render).
  useEffect(() => {
    if (user?.onboardingDone) navigate("/dashboard", { replace: true });
  }, [user?.onboardingDone, navigate]);

  const update = (partial: Partial<OnboardingFormData>) =>
    setFormData((prev) => ({ ...prev, ...partial }));

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const finish = async () => {
    setIsSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers,
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Failed to save onboarding data");
      }

      markOnboardingDone();
      toast.success("Profile created! Let's find you some jobs.");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">JobPilot</span>
          </div>
          <span className="text-sm text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <div className="mx-auto max-w-3xl px-6 pb-4">
          <Progress value={progress} className="h-1.5" />
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Step indicators */}
        <div className="flex items-center justify-between mb-10">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors ${
                    i < step
                      ? "border-primary bg-primary text-primary-foreground"
                      : i === step
                      ? "border-primary text-primary"
                      : "border-muted text-muted-foreground"
                  }`}
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`mt-1.5 text-xs font-medium hidden sm:block ${i === step ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-12 sm:w-20 mx-2 ${i < step ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="rounded-xl border bg-card p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">{STEPS[step].label}</h2>
            <p className="text-muted-foreground mt-1">{STEPS[step].description}</p>
          </div>

          {step === 0 && <StepBasicDetails data={formData} onChange={update} />}
          {step === 1 && <StepApplicationDetails data={formData} onChange={update} />}
          {step === 2 && <StepResumeUpload data={formData} onChange={update} onParsed={update} />}
          {step === 3 && <StepTargetRoles data={formData} onChange={update} />}
          {step === 4 && <StepPreferences data={formData} onChange={update} />}
          {step === 5 && <StepApplicationRules data={formData} onChange={update} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button variant="outline" onClick={prev} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={isSubmitting} size="lg">
              {isSubmitting ? "Setting up…" : "Finish Setup"}
              <Check className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
