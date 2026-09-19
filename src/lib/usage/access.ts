import "server-only";

export function isAppOwner(userId: string | null | undefined) {
  const ownerUserId = process.env.USAGE_OWNER_USER_ID?.trim();

  return Boolean(ownerUserId && userId && userId === ownerUserId);
}

// Retain the original name for the existing usage page while the same
// server-only owner identity is shared by other private administration tools.
export const isUsageOwner = isAppOwner;
