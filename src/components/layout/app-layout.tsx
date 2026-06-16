import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-blue/30 border-t-brand-blue-bright" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!user.onboardingDone) return <Navigate to="/onboarding" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
