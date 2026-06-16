import type { ApplyRequest, TokenSummary } from "../../types/index.js";
import { api, BASE, TOKEN_KEY } from "./client.js";

export async function estimateTokens(req: ApplyRequest): Promise<number> {
  const { data } = await api.post<{ inputTokens: number }>("/api/claude/count-tokens", {
    system: "You are an expert job-application coach.",
    messages: [{ role: "user", content: req.jobDescription }],
  });
  return data.inputTokens;
}

export function streamApplication(
  req: ApplyRequest,
  onText: (chunk: string) => void,
  onDone: (usage: TokenSummary) => void,
  onError: (msg: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE}/api/claude/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ""}`,
    },
    body: JSON.stringify(req),
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.text) onText(payload.text);
          if (payload.done) onDone(payload.usage as TokenSummary);
          if (payload.error) onError(payload.error);
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") onError(String(err));
    });

  return controller;
}
