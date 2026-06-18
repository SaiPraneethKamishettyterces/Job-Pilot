import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/query-client";

// Shared base: query client + toaster + tooltip context. Used by both the main
// app and the separate admin app so the wiring lives in one place. TooltipProvider
// is global so any page using <Tooltip> renders without crashing (was the cause of
// the Applications page "something went wrong" error boundary).
export function BaseProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}

// Main app providers: base + auth context.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <BaseProviders>
      <AuthProvider>{children}</AuthProvider>
    </BaseProviders>
  );
}
