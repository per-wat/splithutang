import { NextResponse } from "next/server";

import { parseAnnouncementPublishInput } from "@/lib/announcements";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isAppOwner } from "@/lib/usage/access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  if (!isAppOwner(user.id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Announcement details are invalid." },
      { status: 400 },
    );
  }

  const parsed = parseAnnouncementPublishInput(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: publishResult, error: publishError } = await admin.rpc(
    "publish_announcement",
    {
      p_created_by: user.id,
      p_title: parsed.data.title,
      p_body: parsed.data.body,
      p_category: parsed.data.category,
      p_action_label: parsed.data.actionLabel,
      p_action_path: parsed.data.actionPath,
      p_expires_at: parsed.data.expiresAt,
      p_send_push: parsed.data.sendPush,
    },
  );

  const result = publishResult?.[0];
  if (publishError || !result) {
    console.error("Unable to publish announcement:", publishError);
    return NextResponse.json(
      { error: "Unable to publish the announcement. Please try again." },
      { status: 500 },
    );
  }

  const { data: announcement, error: announcementError } = await admin
    .from("announcements")
    .select("*")
    .eq("id", result.announcement_id)
    .single();

  if (announcementError || !announcement) {
    console.error("Unable to reload published announcement:", announcementError);
    return NextResponse.json(
      {
        error:
          "The announcement was published, but its summary could not be reloaded.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { announcement },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
