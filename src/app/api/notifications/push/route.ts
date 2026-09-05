import { NextResponse } from "next/server";

import { deliverPendingPushNotifications } from "@/lib/notifications/push-delivery";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const expected = process.env.NOTIFICATION_WEBHOOK_SECRET;
  const supplied = request.headers.get("x-notification-secret");

  if (!expected || supplied !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runDelivery();
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization");

  if (!expected || supplied !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runDelivery();
}

async function runDelivery() {
  try {
    const summary = await deliverPendingPushNotifications();
    return NextResponse.json(summary);
  } catch (deliveryError) {
    console.error("Push delivery failed:", deliveryError);
    return NextResponse.json({ error: "Push delivery failed" }, { status: 500 });
  }
}
