import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import { queryClient } from "@/lib/query-client";

// Shared base: query client + toaster. Used by both the main app and the
// separate admin app so the wiring lives in one place.
export function BaseProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
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
