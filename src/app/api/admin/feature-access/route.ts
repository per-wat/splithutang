import { NextResponse } from "next/server";

import { isFeatureKey, parseFeatureAccessChange } from "@/lib/features/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isAppOwner } from "@/lib/usage/access";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const pageSize = 20;

// Every handler authorizes before constructing the privileged client or
// parsing target user IDs. The owner ID is never accepted from the browser.
async function authorizeOwner() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) return { response: NextResponse.json({ error: "Sign in is required." }, { status: 401, headers }) };
  if (!isAppOwner(user.id)) return { response: NextResponse.json({ error: "Not found." }, { status: 404, headers }) };
  return { user };
}

export async function GET(request: Request) {
  const auth = await authorizeOwner();
  if (auth.response) return auth.response;
  const params = new URL(request.url).searchParams;
  const query = (params.get("query") ?? "").trim();
  const page = Number(params.get("page") ?? "0");
  if (query.length > 100 || !Number.isSafeInteger(page) || page < 0 || page > 10000) {
    return NextResponse.json({ error: "Search or page is invalid." }, { status: 400, headers });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("search_feature_access_users", {
    p_query: query, p_offset: page * pageSize, p_limit: pageSize + 1,
  });
  if (error) {
    console.error("Unable to search feature access users:", error);
    return NextResponse.json({ error: "Unable to load users. Please try again." }, { status: 503, headers });
  }
  const users = (data ?? []).slice(0, pageSize).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    featureKeys: row.enabled_feature_keys.filter(isFeatureKey),
    isOwner: isAppOwner(row.user_id),
  }));
  return NextResponse.json({ users, hasMore: (data?.length ?? 0) > pageSize }, { headers });
}

export async function PATCH(request: Request) {
  const auth = await authorizeOwner();
  if (auth.response) return auth.response;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Feature access details are invalid." }, { status: 400, headers });
  }
  const parsed = parseFeatureAccessChange(payload);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers });
  if (isAppOwner(parsed.userId)) {
    return NextResponse.json({ error: "The creator always has access to every feature." }, { status: 400, headers });
  }

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin.from("profiles")
    .select("id").eq("id", parsed.userId).maybeSingle();
  if (targetError) return NextResponse.json({ error: "Unable to check this user. Please try again." }, { status: 503, headers });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404, headers });

  const { error } = await admin.from("user_feature_access").upsert({
    user_id: parsed.userId,
    feature_key: parsed.featureKey,
    enabled: parsed.enabled,
    updated_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,feature_key" });
  if (error) {
    console.error("Unable to update feature access:", error);
    return NextResponse.json({ error: "Unable to save access. Please try again." }, { status: 503, headers });
  }
  return NextResponse.json({ featureKey: parsed.featureKey, enabled: parsed.enabled }, { headers });
}
