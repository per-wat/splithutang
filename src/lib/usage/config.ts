export type UsageMetricKey =
  | "EGRESS"
  | "CACHED_EGRESS"
  | "DATABASE_SIZE"
  | "STORAGE_SIZE"
  | "MONTHLY_ACTIVE_USERS"
  | "FUNCTION_INVOCATIONS"
  | "REALTIME_MESSAGE_COUNT"
  | "REALTIME_PEAK_CONNECTIONS";

export type UsageMetricUnit = "gigabytes" | "count";

export type UsageMetricConfig = {
  key: UsageMetricKey;
  label: string;
  shortDescription: string;
  unit: UsageMetricUnit;
  freeLimit: number;
  group: "capacity" | "activity";
};

export type RawSupabaseUsageMetric = {
  metric?: unknown;
  usage?: unknown;
  pricing_free_units?: unknown;
  available_in_plan?: unknown;
  capped?: unknown;
};

export type UsageMetric = UsageMetricConfig & {
  current: number | null;
  limit: number;
  ratio: number | null;
  capped: boolean | null;
};

export type ProjectUsageSnapshot = {
  databaseSizeBytes?: unknown;
  storageSizeBytes?: unknown;
  monthlyActiveUsers?: unknown;
};

export const SUPABASE_USAGE_METRICS: UsageMetricConfig[] = [
  {
    key: "EGRESS",
    label: "Egress",
    shortDescription: "Uncached data sent from Supabase to clients.",
    unit: "gigabytes",
    freeLimit: 5,
    group: "capacity",
  },
  {
    key: "CACHED_EGRESS",
    label: "Cached egress",
    shortDescription: "Data served from Supabase's CDN cache.",
    unit: "gigabytes",
    freeLimit: 5,
    group: "capacity",
  },
  {
    key: "DATABASE_SIZE",
    label: "Database size",
    shortDescription: "Space used by Postgres tables, indexes, and objects.",
    unit: "gigabytes",
    freeLimit: 0.5,
    group: "capacity",
  },
  {
    key: "STORAGE_SIZE",
    label: "File storage",
    shortDescription:
      "Files stored by this project; the quota applies across the organization.",
    unit: "gigabytes",
    freeLimit: 1,
    group: "capacity",
  },
  {
    key: "MONTHLY_ACTIVE_USERS",
    label: "Monthly active users (estimate)",
    shortDescription:
      "Distinct active sessions created or refreshed this calendar month.",
    unit: "count",
    freeLimit: 50_000,
    group: "activity",
  },
  {
    key: "FUNCTION_INVOCATIONS",
    label: "Edge Function invocations",
    shortDescription: "Every Edge Function request, regardless of response.",
    unit: "count",
    freeLimit: 500_000,
    group: "activity",
  },
  {
    key: "REALTIME_MESSAGE_COUNT",
    label: "Realtime messages",
    shortDescription: "Database changes, broadcasts, and presence messages.",
    unit: "count",
    freeLimit: 2_000_000,
    group: "activity",
  },
  {
    key: "REALTIME_PEAK_CONNECTIONS",
    label: "Realtime peak connections",
    shortDescription: "Highest number of simultaneous Realtime connections.",
    unit: "count",
    freeLimit: 200,
    group: "activity",
  },
];

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function buildUsageMetrics(
  rawMetrics: RawSupabaseUsageMetric[] = [],
): UsageMetric[] {
  const rawByKey = new Map(
    rawMetrics
      .filter(
        (metric): metric is RawSupabaseUsageMetric & { metric: string } =>
          typeof metric.metric === "string",
      )
      .map((metric) => [metric.metric, metric]),
  );

  return SUPABASE_USAGE_METRICS.map((config) => {
    const raw = rawByKey.get(config.key);
    const current = finiteNumber(raw?.usage);
    const apiLimit = finiteNumber(raw?.pricing_free_units);
    const limit = apiLimit !== null && apiLimit > 0 ? apiLimit : config.freeLimit;

    return {
      ...config,
      current,
      limit,
      ratio: current === null || limit <= 0 ? null : current / limit,
      capped: typeof raw?.capped === "boolean" ? raw.capped : null,
    };
  });
}

export function buildProjectUsageMetrics(
  snapshot: ProjectUsageSnapshot,
): UsageMetric[] {
  const bytesPerGigabyte = 1_000_000_000;
  const databaseSizeBytes = finiteNumber(snapshot.databaseSizeBytes);
  const storageSizeBytes = finiteNumber(snapshot.storageSizeBytes);

  return buildUsageMetrics([
    {
      metric: "DATABASE_SIZE",
      usage:
        databaseSizeBytes === null
          ? null
          : databaseSizeBytes / bytesPerGigabyte,
    },
    {
      metric: "STORAGE_SIZE",
      usage:
        storageSizeBytes === null ? null : storageSizeBytes / bytesPerGigabyte,
    },
    {
      metric: "MONTHLY_ACTIVE_USERS",
      usage: snapshot.monthlyActiveUsers,
    },
  ]);
}
