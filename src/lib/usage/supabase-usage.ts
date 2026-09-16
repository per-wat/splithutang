import "server-only";

import {
  buildProjectUsageMetrics,
  buildUsageMetrics,
  type UsageMetric,
} from "@/lib/usage/config";

const SUPABASE_MANAGEMENT_API_URL = "https://api.supabase.com";

type SupabaseProjectApiResponse = {
  organization_slug?: unknown;
};

type SupabaseProjectUsageRow = {
  database_size_bytes?: unknown;
  storage_size_bytes?: unknown;
  monthly_active_users?: unknown;
};

const PROJECT_USAGE_QUERY = `
select
  pg_database_size(current_database())::bigint as database_size_bytes,
  coalesce((
    select sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0))
    from storage.objects as o
    where o.is_delete_marker is not true
  ), 0)::bigint as storage_size_bytes,
  (
    select count(distinct s.user_id)
    from auth.sessions as s
    where coalesce(s.refreshed_at at time zone 'UTC', s.created_at)
      >= date_trunc('month', now())
  )::bigint as monthly_active_users
`;

export type SupabaseUsageResult = {
  status: "ready" | "not_configured" | "error";
  metrics: UsageMetric[];
  projectRef: string | null;
  dashboardUrl: string;
  refreshedAt: string;
  message: string | null;
};

function projectRefFromUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const hostname = new URL(value).hostname;
    return hostname.endsWith(".supabase.co")
      ? hostname.slice(0, -".supabase.co".length)
      : null;
  } catch {
    return null;
  }
}

function usageDashboardUrl(
  orgSlug: string | null,
  projectRef: string | null,
) {
  if (orgSlug) {
    const url = new URL(
      `/dashboard/org/${encodeURIComponent(orgSlug)}/usage`,
      "https://supabase.com",
    );

    if (projectRef) {
      url.searchParams.set("projectRef", projectRef);
    }

    return url.toString();
  }

  return projectRef
    ? `https://supabase.com/dashboard/project/${encodeURIComponent(projectRef)}/settings/billing/usage`
    : "https://supabase.com/dashboard";
}

function failedUsageResult({
  message,
  projectRef,
  dashboardUrl,
  refreshedAt,
}: {
  message: string;
  projectRef: string | null;
  dashboardUrl: string;
  refreshedAt: string;
}): SupabaseUsageResult {
  return {
    status: "error",
    metrics: buildUsageMetrics(),
    projectRef,
    dashboardUrl,
    refreshedAt,
    message,
  };
}

function projectLookupError(status: number) {
  if (status === 401) {
    return "Supabase rejected SUPABASE_ACCESS_TOKEN. Replace it with a valid Personal Access Token.";
  }

  if (status === 403) {
    return "The scoped Supabase token needs Project Settings → Read for this project.";
  }

  if (status === 404) {
    return "Supabase could not find this project. Check SUPABASE_PROJECT_REF.";
  }

  return `Supabase project lookup failed (HTTP ${status}).`;
}

function usageQueryError(status: number) {
  if (status === 401) {
    return "Supabase accepted the project token but rejected the live database check. Generate a new Personal Access Token and redeploy.";
  }

  if (status === 403) {
    return "The scoped Supabase token needs Database → Read to load live database, Storage, and active-user values.";
  }

  return `Supabase live project usage check failed (HTTP ${status}).`;
}

export async function getSupabaseUsage(): Promise<SupabaseUsageResult> {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const projectRef =
    process.env.SUPABASE_PROJECT_REF?.trim() ||
    projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  let dashboardUrl = usageDashboardUrl(null, projectRef);
  const refreshedAt = new Date().toISOString();

  if (!accessToken || !projectRef) {
    return {
      status: "not_configured",
      metrics: buildUsageMetrics(),
      projectRef,
      dashboardUrl,
      refreshedAt,
      message:
        "Add SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF as server-only environment variables to load live billing-cycle values.",
    };
  }

  const projectUrl = new URL(
    `/v1/projects/${encodeURIComponent(projectRef)}`,
    SUPABASE_MANAGEMENT_API_URL,
  );
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  try {
    const projectResponse = await fetch(projectUrl, {
      headers,
      cache: "no-store",
    });

    if (!projectResponse.ok) {
      console.error("Supabase project lookup failed:", projectResponse.status);

      return failedUsageResult({
        message: projectLookupError(projectResponse.status),
        projectRef,
        dashboardUrl,
        refreshedAt,
      });
    }

    const project = (await projectResponse.json()) as SupabaseProjectApiResponse;
    const orgSlug =
      typeof project.organization_slug === "string"
        ? project.organization_slug.trim()
        : "";

    if (!orgSlug) {
      console.error(
        "Supabase project response did not include an organization slug.",
      );

      return failedUsageResult({
        message:
          "Supabase returned project details without an organization. Open the dashboard for exact values.",
        projectRef,
        dashboardUrl,
        refreshedAt,
      });
    }

    dashboardUrl = usageDashboardUrl(orgSlug, projectRef);

    const usageUrl = new URL(
      `/v1/projects/${encodeURIComponent(projectRef)}/database/query/read-only`,
      SUPABASE_MANAGEMENT_API_URL,
    );

    const usageResponse = await fetch(usageUrl, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: PROJECT_USAGE_QUERY }),
      cache: "no-store",
    });

    if (!usageResponse.ok) {
      console.error("Supabase live usage query failed:", usageResponse.status);

      return failedUsageResult({
        message: usageQueryError(usageResponse.status),
        projectRef,
        dashboardUrl,
        refreshedAt,
      });
    }

    const payload = (await usageResponse.json()) as unknown;
    const usageRow = Array.isArray(payload)
      ? (payload[0] as SupabaseProjectUsageRow | undefined)
      : undefined;

    if (!usageRow || typeof usageRow !== "object") {
      console.error("Supabase live usage query returned an unexpected response.");

      return failedUsageResult({
        message:
          "Supabase returned an unexpected response for the live project checks. Open the dashboard for exact billing values.",
        projectRef,
        dashboardUrl,
        refreshedAt,
      });
    }

    return {
      status: "ready",
      metrics: buildProjectUsageMetrics({
        databaseSizeBytes: usageRow.database_size_bytes,
        storageSizeBytes: usageRow.storage_size_bytes,
        monthlyActiveUsers: usageRow.monthly_active_users,
      }),
      projectRef,
      dashboardUrl,
      refreshedAt,
      message:
        "Database size, file storage, and this month's active users are live. Supabase exposes egress, Edge Function, and Realtime billing totals only in its Dashboard.",
    };
  } catch (error) {
    console.error("Unable to reach the Supabase usage service:", error);

    return failedUsageResult({
      message:
        "Supabase usage is temporarily unavailable. The Free-plan limits below are still current.",
      projectRef,
      dashboardUrl,
      refreshedAt,
    });
  }
}
