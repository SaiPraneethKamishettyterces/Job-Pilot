import type { Application } from "../../types/index.js";
import { api } from "./client.js";

export type ApplicationsResponse = {
  applications: Application[];
  total: number;
};

export type GetApplicationsParams = {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function getApplications(params?: GetApplicationsParams): Promise<ApplicationsResponse> {
  const { data } = await api.get<ApplicationsResponse>("/api/applications", { params });
  return data;
}

export async function updateApplication(
  id: string,
  updates: { status?: string; notes?: string; followUpDate?: string | null; hiringManagerEmail?: string }
): Promise<{ application: Application }> {
  const { data } = await api.patch(`/api/applications/${id}`, updates);
  return data;
}

export async function archiveApplication(id: string): Promise<void> {
  await api.delete(`/api/applications/${id}`);
}
