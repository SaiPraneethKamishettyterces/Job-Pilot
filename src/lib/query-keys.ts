// Centralized, typed TanStack Query keys. Using a factory (instead of ad-hoc
// string arrays scattered across pages) keeps cache keys consistent and makes
// invalidation discoverable. Pages adopt these incrementally.
//
// Example:
//   useQuery({ queryKey: queryKeys.stats(), queryFn: getDashboardStats })
//   queryClient.invalidateQueries({ queryKey: queryKeys.applications.all() })

export const queryKeys = {
  stats: () => ["stats"] as const,

  profile: () => ["profile"] as const,

  subscription: () => ["subscription"] as const,

  jobs: {
    all: () => ["jobs"] as const,
    list: (decision?: string) => ["jobs", { decision: decision ?? null }] as const,
    detail: (id: string) => ["jobs", id] as const,
    candidates: (runId?: string) => ["job-candidates", { runId: runId ?? null }] as const,
  },

  applications: {
    all: () => ["applications"] as const,
    list: (params?: Record<string, unknown>) => ["applications", params ?? {}] as const,
  },

  ingestion: {
    all: () => ["ingestion"] as const,
    detail: (runId: string) => ["ingestion", runId] as const,
  },

  billing: {
    company: () => ["billing", "company"] as const,
    users: () => ["billing", "users"] as const,
  },
} as const;
