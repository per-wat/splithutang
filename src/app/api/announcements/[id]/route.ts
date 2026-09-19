import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isAppOwner } from "@/lib/usage/access";

type AnnouncementAction = "archive" | "expire";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/announcements/[id]">,
) {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  if (!isAppOwner(user.id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { id } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Action is invalid." }, { status: 400 });
  }

  const action = readAction(payload);
  if (!action) {
    return NextResponse.json({ error: "Action is invalid." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const updates =
    action === "archive" ? { archived_at: now } : { expires_at: now };
  const { data: announcement, error: updateError } = await admin
    .from("announcements")
    .update(updates)
    .eq("id", id)
    .is("archived_at", null)
    .select("*")
    .maybeSingle();

  if (updateError) {
    console.error("Unable to update announcement:", updateError);
    return NextResponse.json(
      { error: "Unable to update the announcement. Please try again." },
      { status: 500 },
    );
  }

  if (!announcement) {
    return NextResponse.json(
      { error: "Announcement was not found or is already archived." },
      { status: 404 },
    );
  }

  const { error: notificationError } = await admin
    .from("notifications")
    .update({ read_at: now })
    .eq("notification_type", "announcement_published")
    .eq("resource_type", "announcement")
    .eq("resource_id", id)
    .is("read_at", null);

  if (notificationError) {
    console.error(
      "Announcement updated, but notifications could not be closed:",
      notificationError,
    );
  }

  return NextResponse.json(
    { announcement },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

function readAction(value: unknown): AnnouncementAction | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "action" in value &&
    (value.action === "archive" || value.action === "expire")
  ) {
    return value.action;
  }

  return null;
}
