import "server-only";

import {
  buildUsageMetrics,
  type RawSupabaseUsageMetric,
  type UsageMetric,
} from "@/lib/usage/config";

const SUPABASE_MANAGEMENT_API_URL = "https://api.supabase.com";

type SupabaseUsageApiResponse = {
  usages?: RawSupabaseUsageMetric[];
};

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
  orgSlug: string | undefined,
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

export async function getSupabaseUsage(): Promise<SupabaseUsageResult> {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const orgSlug = process.env.SUPABASE_ORGANIZATION_SLUG?.trim();
  const projectRef =
    process.env.SUPABASE_PROJECT_REF?.trim() ||
    projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const dashboardUrl = usageDashboardUrl(orgSlug, projectRef);
  const refreshedAt = new Date().toISOString();

  if (!accessToken || !orgSlug || !projectRef) {
    return {
      status: "not_configured",
      metrics: buildUsageMetrics(),
      projectRef,
      dashboardUrl,
      refreshedAt,
      message:
        "Add the server-only Supabase usage variables to load live billing-cycle values.",
    };
  }

  const url = new URL(
    `/platform/organizations/${encodeURIComponent(orgSlug)}/usage`,
    SUPABASE_MANAGEMENT_API_URL,
  );
  url.searchParams.set("project_ref", projectRef);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Supabase usage request failed:", response.status);

      return {
        status: "error",
        metrics: buildUsageMetrics(),
        projectRef,
        dashboardUrl,
        refreshedAt,
        message:
          "Live usage could not be loaded. Check the access token and organization slug.",
      };
    }

    const payload = (await response.json()) as SupabaseUsageApiResponse;

    if (!Array.isArray(payload.usages)) {
      console.error("Supabase usage response did not include a usages array.");

      return {
        status: "error",
        metrics: buildUsageMetrics(),
        projectRef,
        dashboardUrl,
        refreshedAt,
        message:
          "Supabase returned an unexpected usage response. Open the dashboard for exact values.",
      };
    }

    return {
      status: "ready",
      metrics: buildUsageMetrics(payload.usages),
      projectRef,
      dashboardUrl,
      refreshedAt,
      message: null,
    };
  } catch (error) {
    console.error("Unable to reach the Supabase usage service:", error);

    return {
      status: "error",
      metrics: buildUsageMetrics(),
      projectRef,
      dashboardUrl,
      refreshedAt,
      message:
        "Supabase usage is temporarily unavailable. The Free-plan limits below are still current.",
    };
  }
}
