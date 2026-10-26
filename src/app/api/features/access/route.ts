import { NextResponse } from "next/server";

import { getFeatureAccess } from "@/lib/features/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const { user, featureKeys } = await getFeatureAccess();
    if (!user) {
      return NextResponse.json({ error: "Sign in is required." }, { status: 401, headers });
    }
    return NextResponse.json({ featureKeys }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to check feature access. Please try again." }, { status: 503, headers });
  }
}
