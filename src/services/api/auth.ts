import { api } from "./client.js";

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const { data } = await api.post("/api/auth/forgot-password", { email });
  return data;
}

export async function resetPassword(token: string, password: string): Promise<{ message: string }> {
  const { data } = await api.post("/api/auth/reset-password", { token, password });
  return data;
}

export async function verifyEmail(token: string): Promise<{ message: string }> {
  const { data } = await api.post("/api/auth/verify-email", { token });
  return data;
}

export async function resendVerification(): Promise<{ message: string }> {
  const { data } = await api.post("/api/auth/resend-verification");
  return data;
}
