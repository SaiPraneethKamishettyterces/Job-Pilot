import { api } from "./client.js";

export interface ActivityEvent {
  id: string;
  kind: "application" | "subscription";
  type: string;
  description: string | null;
  company: string | null;
  roleTitle: string | null;
  applicationId: string | null;
  createdAt: string;
}

export async function getActivity(limit = 100): Promise<{ events: ActivityEvent[]; total: number }> {
  const { data } = await api.get("/api/activity", { params: { limit } });
  return data;
}
