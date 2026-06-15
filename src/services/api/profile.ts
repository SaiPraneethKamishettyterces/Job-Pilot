import type { UserProfile, UserPreference } from "../../types/index.js";
import { api } from "./client.js";

export type ProfileResponse = {
  profile: UserProfile | null;
  preferences: UserPreference | null;
};

export async function getProfile(): Promise<ProfileResponse> {
  const { data } = await api.get<ProfileResponse>("/api/profile");
  return data;
}

export async function updateProfile(profile: Partial<UserProfile>): Promise<{ profile: UserProfile }> {
  const { data } = await api.put<{ profile: UserProfile }>("/api/profile", profile);
  return data;
}

export async function updatePreferences(
  prefs: Partial<UserPreference>
): Promise<{ preferences: UserPreference }> {
  const { data } = await api.put<{ preferences: UserPreference }>("/api/profile/preferences", prefs);
  return data;
}
