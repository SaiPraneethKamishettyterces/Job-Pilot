import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Providers } from "./app/providers";
import { ErrorBoundary } from "./components/error-boundary";
import { AppLayout } from "./components/layout/app-layout";
import { LoginPage } from "./pages/auth/login";
import { SignupPage } from "./pages/auth/signup";
import { OnboardingPage } from "./pages/onboarding/onboarding";
import { DashboardPage } from "./pages/dashboard/dashboard";
import { ApplicationsPage } from "./pages/applications/applications";
import { RunsPage } from "./pages/runs/runs";
import { ResumePage } from "./pages/resume/resume";
import { ReviewPage } from "./pages/review/review";
import { AnalyticsPage } from "./pages/analytics/analytics";
import { BillingPage } from "./pages/billing/billing";
import { SettingsPage } from "./pages/settings/settings";
import { JobsPage } from "./pages/jobs/jobs";
import { CandidatesPage } from "./pages/candidates/candidates";
import { ProfileEditorPage } from "./pages/profile/profile-editor";
import { ContactPage } from "./pages/contact/contact";
import { HelpPage } from "./pages/help/help";

export default function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <BrowserRouter>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
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
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfileEditorPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      </Providers>
    </ErrorBoundary>
  );
}
