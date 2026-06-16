import { api } from "./client.js";

export type PlanUsage = {
  planName: string;
  applicationsPerMonth: number;
  tailoringsPerMonth: number;
  automationEnabled: boolean;
  applicationsUsed: number;
  applicationsRemaining: number;
  periodResetsAt: string;
  active: boolean;
};

export type SubscriptionStatus = {
  status: "inactive" | "trial" | "active" | "past_due" | "cancelled";
  planName: string | null;
  currentPeriodEnd: string | null;
  paymentProvider: string | null;
  usage?: PlanUsage;
  stripeEnabled: boolean;
};

export async function getSubscription(): Promise<SubscriptionStatus> {
  const { data } = await api.get<SubscriptionStatus>("/api/subscription");
  return data;
}

// Start a Stripe Checkout session and return the redirect URL.
export async function startCheckout(plan: string): Promise<{ url: string }> {
  const { data } = await api.post<{ url: string }>("/api/subscription/checkout", { plan });
  return data;
}

// Open the Stripe billing portal (manage / cancel).
export async function openBillingPortal(): Promise<{ url: string }> {
  const { data } = await api.post<{ url: string }>("/api/subscription/portal");
  return data;
}

// DEV: simulate a completed payment → activates subscription and starts ingestion.
export async function activateSubscription(): Promise<{
  message: string;
  subscriptionStatus: string;
  run: { id: string; status: string; triggerType: string | null };
}> {
  const { data } = await api.post("/api/subscription/activate");
  return data;
}

export type IngestionRun = {
  id: string;
  status: string;
  triggerType: string | null;
  requestedSources: string[];
  jobsDiscovered: number;
  jobsInserted: number;
  duplicatesSkipped: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export async function startIngestion(): Promise<{ message: string; run: IngestionRun }> {
  const { data } = await api.post("/api/ingestion/start");
  return data;
}

export async function getIngestionRuns(): Promise<{ runs: IngestionRun[]; total: number }> {
  const { data } = await api.get("/api/ingestion");
  return data;
}

export async function getIngestionRun(runId: string): Promise<IngestionRun> {
  const { data } = await api.get<IngestionRun>(`/api/ingestion/${runId}`);
  return data;
}
