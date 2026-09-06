import { isIP } from "node:net";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input: unknown = await request.json().catch(() => null);
  if (!isSubscriptionInput(input)) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from("push_subscriptions")
    .select("user_id")
    .eq("endpoint", input.endpoint)
    .maybeSingle();

  if (lookupError) {
    console.error("Unable to check push subscription ownership:", lookupError);
    return NextResponse.json({ error: "Unable to save subscription" }, { status: 500 });
  }

  if (existing && existing.user_id !== user.id) {
    return NextResponse.json({ error: "Subscription belongs to another account" }, { status: 409 });
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      user_agent: request.headers.get("user-agent"),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("Unable to save push subscription:", error);
    return NextResponse.json({ error: "Unable to save subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input: unknown = await request.json().catch(() => null);
  const endpoint =
    isRecord(input) && typeof input.endpoint === "string" ? input.endpoint : "";

  if (!isSafeEndpoint(endpoint)) {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) {
    console.error("Unable to remove push subscription:", error);
    return NextResponse.json({ error: "Unable to remove subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function isSubscriptionInput(value: unknown): value is SubscriptionInput {
  if (!isRecord(value) || !isRecord(value.keys)) {
    return false;
  }

  return (
    typeof value.endpoint === "string" &&
    isSafeEndpoint(value.endpoint) &&
    typeof value.keys.p256dh === "string" &&
    value.keys.p256dh.length > 0 &&
    value.keys.p256dh.length <= 512 &&
    typeof value.keys.auth === "string" &&
    value.keys.auth.length > 0 &&
    value.keys.auth.length <= 512
  );
}

function isSafeEndpoint(value: string) {
  if (value.length === 0 || value.length > 4096) {
    return false;
  }

  try {
    const endpoint = new URL(value);
    const hostname = endpoint.hostname.replace(/^\[|\]$/g, "").toLowerCase();

    return (
      endpoint.protocol === "https:" &&
      (endpoint.port === "" || endpoint.port === "443") &&
      endpoint.username === "" &&
      endpoint.password === "" &&
      hostname !== "localhost" &&
      !hostname.endsWith(".localhost") &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".internal") &&
      isIP(hostname) === 0
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
