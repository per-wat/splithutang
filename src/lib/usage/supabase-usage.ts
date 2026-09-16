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

type SupabaseProjectApiResponse = {
  organization_slug?: unknown;
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

function usageRequestError(status: number) {
  if (status === 401) {
    return "Supabase rejected SUPABASE_ACCESS_TOKEN. Replace it with a valid Personal Access Token.";
  }

  if (status === 403) {
    return "Supabase denied billing usage access. Grant Usage Analytics → Read to the scoped token; if it is already granted, use a classic Personal Access Token for this dashboard endpoint.";
  }

  return `Supabase billing usage request failed (HTTP ${status}).`;
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
      `/platform/organizations/${encodeURIComponent(orgSlug)}/usage`,
      SUPABASE_MANAGEMENT_API_URL,
    );
    usageUrl.searchParams.set("project_ref", projectRef);

    const usageResponse = await fetch(usageUrl, {
      headers,
      cache: "no-store",
    });

    if (!usageResponse.ok) {
      console.error("Supabase usage request failed:", usageResponse.status);

      return failedUsageResult({
        message: usageRequestError(usageResponse.status),
        projectRef,
        dashboardUrl,
        refreshedAt,
      });
    }

    const payload = (await usageResponse.json()) as SupabaseUsageApiResponse;

    if (!Array.isArray(payload.usages)) {
      console.error("Supabase usage response did not include a usages array.");

      return failedUsageResult({
        message:
          "Supabase returned an unexpected usage response. Open the dashboard for exact values.",
        projectRef,
        dashboardUrl,
        refreshedAt,
      });
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

    return failedUsageResult({
      message:
        "Supabase usage is temporarily unavailable. The Free-plan limits below are still current.",
      projectRef,
      dashboardUrl,
      refreshedAt,
    });
  }
}
