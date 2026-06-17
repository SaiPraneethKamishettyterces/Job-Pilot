import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Providers } from "./app/providers";
import { ErrorBoundary } from "./components/error-boundary";
import { AppLayout } from "./components/layout/app-layout";

// Auth + onboarding load eagerly (first paint / unauthenticated entry points).
import { LoginPage } from "./pages/auth/login";
import { SignupPage } from "./pages/auth/signup";
import { ForgotPasswordPage } from "./pages/auth/forgot-password";
import { ResetPasswordPage } from "./pages/auth/reset-password";
import { VerifyEmailPage } from "./pages/auth/verify-email";

// Everything else is route-split so the initial bundle stays small — each page
// becomes its own chunk loaded on demand (heavy deps like recharts no longer
// sit in the main bundle).
const named = <T extends string>(loader: () => Promise<Record<T, React.ComponentType>>, key: T) =>
  lazy(() => loader().then((m) => ({ default: m[key] })));

const OnboardingPage = named(() => import("./pages/onboarding/onboarding"), "OnboardingPage");
const DashboardPage = named(() => import("./pages/dashboard/dashboard"), "DashboardPage");
const ApplicationsPage = named(() => import("./pages/applications/applications"), "ApplicationsPage");
const RunsPage = named(() => import("./pages/runs/runs"), "RunsPage");
const ResumePage = named(() => import("./pages/resume/resume"), "ResumePage");
const ReviewPage = named(() => import("./pages/review/review"), "ReviewPage");
const AnalyticsPage = named(() => import("./pages/analytics/analytics"), "AnalyticsPage");
const BillingPage = named(() => import("./pages/billing/billing"), "BillingPage");
const SettingsPage = named(() => import("./pages/settings/settings"), "SettingsPage");
const JobsPage = named(() => import("./pages/jobs/jobs"), "JobsPage");
const CandidatesPage = named(() => import("./pages/candidates/candidates"), "CandidatesPage");
const ProfileEditorPage = named(() => import("./pages/profile/profile-editor"), "ProfileEditorPage");
const ActivityPage = named(() => import("./pages/activity/activity"), "ActivityPage");
const ContactPage = named(() => import("./pages/contact/contact"), "ContactPage");
const HelpPage = named(() => import("./pages/help/help"), "HelpPage");

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* Public auth routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />

              {/* Public support routes (accessible without login) */}
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/help" element={<HelpPage />} />

              {/* Protected app routes */}
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/candidates" element={<CandidatesPage />} />
                <Route path="/applications" element={<ApplicationsPage />} />
                <Route path="/runs" element={<RunsPage />} />
                <Route path="/resume" element={<ResumePage />} />
                <Route path="/review" element={<ReviewPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/profile" element={<ProfileEditorPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </Providers>
    </ErrorBoundary>
  );
}
