import "server-only";

export function isUsageOwner(userId: string | null | undefined) {
  const ownerUserId = process.env.USAGE_OWNER_USER_ID?.trim();

  return Boolean(ownerUserId && userId && userId === ownerUserId);
}
