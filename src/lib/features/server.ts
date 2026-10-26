import "server-only";

import { notFound, redirect } from "next/navigation";

import { isFeatureKey, resolveFeatureKeys, type FeatureKey } from "@/lib/features/catalog";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isAppOwner } from "@/lib/usage/access";

// Read the current session and live grants on every request. Never accept a
// caller-supplied user ID, a UI flag, or editable JWT user_metadata as authority.
export async function getFeatureAccess() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) return { user: null, featureKeys: [] as FeatureKey[] };
  if (isAppOwner(user.id)) {
    return { user, featureKeys: resolveFeatureKeys(true, []) };
  }

  const { data, error } = await supabase
    .from("user_feature_access")
    .select("feature_key, enabled")
    .eq("user_id", user.id)
    .eq("enabled", true);
  if (error) {
    // Fail closed: a missing migration or outage must never grant access.
    throw new Error("Unable to check feature access. Please try again.");
  }
  return { user, featureKeys: resolveFeatureKeys(false, data ?? []) };
}

// Use at the start of each restricted server page. Restricted APIs should use
// getFeatureAccess and return 401/403 before reading or writing feature data.
export async function requireFeatureAccess(featureKey: FeatureKey) {
  if (!isFeatureKey(featureKey)) notFound();
  const access = await getFeatureAccess();
  if (!access.user) redirect("/login");
  if (!access.featureKeys.includes(featureKey)) notFound();
  return access.user;
}
