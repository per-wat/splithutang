import {
  Activity,
  ArrowUpRight,
  CloudDownload,
  Database,
  Gauge,
  HardDrive,
  Radio,
  Users,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { RefreshUsageButton } from "@/components/usage/refresh-usage-button";
import type { UsageMetric, UsageMetricKey } from "@/lib/usage/config";
import type { SupabaseUsageResult } from "@/lib/usage/supabase-usage";

const metricIcons: Record<UsageMetricKey, LucideIcon> = {
  EGRESS: CloudDownload,
  CACHED_EGRESS: Zap,
  DATABASE_SIZE: Database,
  STORAGE_SIZE: HardDrive,
  MONTHLY_ACTIVE_USERS: Users,
  FUNCTION_INVOCATIONS: Activity,
  REALTIME_MESSAGE_COUNT: Radio,
  REALTIME_PEAK_CONNECTIONS: Wifi,
};

function formatMetricValue(value: number, unit: UsageMetric["unit"]) {
  if (unit === "count") {
    return Math.round(value).toLocaleString("en-MY");
  }

  if (value > 0 && value < 1) {
    return `${Math.round(value * 1_000).toLocaleString("en-MY")} MB`;
  }

  return `${value === 0 ? "0" : value.toFixed(value < 10 ? 2 : 1)} GB`;
}

function metricStatus(metric: UsageMetric) {
  if (metric.ratio === null) {
    return {
      label: "Dashboard only",
      badge: "bg-zinc-500/10 text-zinc-400",
      bar: "bg-zinc-600",
    };
  }

  if (metric.ratio >= 1) {
    return {
      label: "Limit reached",
      badge: "bg-red-500/10 text-red-300",
      bar: "bg-red-500",
    };
  }

  if (metric.ratio >= 0.9) {
    return {
      label: "Almost full",
      badge: "bg-red-500/10 text-red-300",
      bar: "bg-red-500",
    };
  }

  if (metric.ratio >= 0.75) {
    return {
      label: "Keep an eye on it",
      badge: "bg-amber-500/10 text-amber-300",
      bar: "bg-amber-400",
    };
  }

  return {
    label: "Healthy",
    badge: "bg-emerald-500/10 text-emerald-300",
    bar: "bg-emerald-400",
  };
}

function UsageCard({ metric }: { metric: UsageMetric }) {
  const Icon = metricIcons[metric.key];
  const status = metricStatus(metric);
  const progress =
    metric.ratio === null ? 0 : Math.max(0, Math.min(metric.ratio * 100, 100));
  const remaining =
    metric.current === null ? null : Math.max(metric.limit - metric.current, 0);

  return (
    <article className="rounded-2xl border border-white/[0.08] bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-blue-300">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{metric.label}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {metric.shortDescription}
            </p>
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${status.badge}`}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Used
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums">
            {metric.current === null
              ? "—"
              : formatMetricValue(metric.current, metric.unit)}
          </p>
        </div>
        <p className="pb-0.5 text-right text-xs text-muted-foreground">
          of {formatMetricValue(metric.limit, metric.unit)}
        </p>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-label={`${metric.label} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={metric.ratio === null ? undefined : Math.round(progress)}
      >
        <div
          className={`h-full rounded-full transition-[width] ${status.bar}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>
          {metric.ratio === null
            ? "Open Supabase for live value"
            : `${Math.round(metric.ratio * 100)}% used`}
        </span>
        <span className="text-right">
          {remaining === null
            ? "Free-plan quota"
            : `${formatMetricValue(remaining, metric.unit)} left`}
        </span>
      </div>
    </article>
  );
}

function UsageSection({
  title,
  description,
  metrics,
}: {
  title: string;
  description: string;
  metrics: UsageMetric[];
}) {
  return (
    <section className="mt-7">
      <div className="mb-3">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-3">
        {metrics.map((metric) => (
          <UsageCard key={metric.key} metric={metric} />
        ))}
      </div>
    </section>
  );
}

export function UsageDashboard({ usage }: { usage: SupabaseUsageResult }) {
  const capacity = usage.metrics.filter((metric) => metric.group === "capacity");
  const activity = usage.metrics.filter((metric) => metric.group === "activity");
  const trackedMetrics = usage.metrics.filter((metric) => metric.ratio !== null);
  const warningCount = trackedMetrics.filter(
    (metric) => (metric.ratio ?? 0) >= 0.75,
  ).length;

  return (
    <div className="px-5 pb-10 pt-4">
      <section className="rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-600/[0.12] to-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-300">
              <Gauge className="size-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.12em]">
                Supabase Free
              </p>
            </div>
            <h2 className="mt-3 text-2xl font-bold">
              {trackedMetrics.length === 0
                ? "Quotas ready"
                : warningCount === 0
                  ? "Usage looks healthy"
                  : `${warningCount} limit${warningCount === 1 ? "" : "s"} need attention`}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Supported live project checks plus current Free-plan quotas.
            </p>
          </div>
          <RefreshUsageButton />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>{usage.projectRef ?? "Project not configured"}</span>
          <span aria-hidden="true">·</span>
          <span>
            Updated {new Date(usage.refreshedAt).toLocaleString("en-MY", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kuala_Lumpur",
            })}
          </span>
        </div>
      </section>

      {usage.status !== "ready" && (
        <section className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4">
          <p className="text-sm font-semibold text-amber-200">
            {usage.status === "not_configured"
              ? "Live usage needs one-time setup"
              : "Live usage is unavailable"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
            {usage.message} The cards still show the current Free-plan quotas.
          </p>
        </section>
      )}

      {usage.status === "ready" && usage.message && (
        <section className="mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/[0.07] p-4">
          <p className="text-sm font-semibold text-blue-200">
            Live project checks loaded
          </p>
          <p className="mt-1 text-xs leading-relaxed text-blue-100/70">
            {usage.message}
          </p>
        </section>
      )}

      <UsageSection
        title="Data & bandwidth"
        description="The limits most likely to grow as receipts, avatars, and app activity increase."
        metrics={capacity}
      />
      <UsageSection
        title="Users & live activity"
        description="Monthly authentication, Edge Function, and Realtime allowances."
        metrics={activity}
      />

      <section className="mt-7 rounded-2xl border border-white/[0.08] bg-card p-4">
        <h2 className="text-sm font-semibold">About these limits</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Most allowances apply across the Supabase organization, while the
          Free-plan database-size limit applies per project. Supabase may refresh
          different metrics hourly or daily.
        </p>
        <a
          href={usage.dashboardUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-blue-300 hover:text-blue-200"
        >
          Open detailed Supabase usage
          <ArrowUpRight className="size-4" />
        </a>
      </section>
    </div>
  );
}
