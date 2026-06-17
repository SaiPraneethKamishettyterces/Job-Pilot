import { api } from "./client.js";

// Trigger a browser download of the full account export JSON.
export async function exportAccount(): Promise<void> {
  const res = await api.get("/api/account/export", { responseType: "blob" });
  const blob = new Blob([res.data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "jobpilot-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function deleteAccount(): Promise<{ message: string }> {
  const { data } = await api.delete("/api/account");
  return data;
}
