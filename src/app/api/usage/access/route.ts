import { NextResponse } from "next/server";

import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isUsageOwner } from "@/lib/usage/access";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  return NextResponse.json(
    { canViewUsage: isUsageOwner(user?.id) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
