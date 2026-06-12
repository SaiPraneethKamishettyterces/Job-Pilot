import { useCallback, useRef, useState } from "react";
import { streamApplication } from "../services/api.js";
import type { ApplyRequest, TokenSummary } from "../types/index.js";

interface StreamState {
  text: string;
  isStreaming: boolean;
  usage: TokenSummary | null;
  error: string | null;
}

export function useClaudeStream() {
  const [state, setState] = useState<StreamState>({
    text: "",
    isStreaming: false,
    usage: null,
    error: null,
  });

  const controllerRef = useRef<AbortController | null>(null);

  const generate = useCallback((req: ApplyRequest) => {
    controllerRef.current?.abort();
    setState({ text: "", isStreaming: true, usage: null, error: null });

    controllerRef.current = streamApplication(
      req,
      (chunk) => setState((s) => ({ ...s, text: s.text + chunk })),
      (usage) => setState((s) => ({ ...s, isStreaming: false, usage })),
      (error) => setState((s) => ({ ...s, isStreaming: false, error }))
    );
  }, []);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    setState((s) => ({ ...s, isStreaming: false }));
  }, []);

  return { ...state, generate, abort };
}
