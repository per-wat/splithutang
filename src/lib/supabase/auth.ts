import type { JwtPayload } from "@supabase/supabase-js";

type VerifiedClaimsClient = {
  auth: {
    getClaims: () => Promise<{
      data: { claims: JwtPayload } | null;
      error: unknown;
    }>;
  };
};

export type VerifiedUser = {
  id: string;
  email: string | null;
  displayName: string | null;
};

export async function getVerifiedUser(
  supabase: VerifiedClaimsClient,
): Promise<VerifiedUser | null> {
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims.sub) {
    return null;
  }

  const { claims } = data;
  const metadataDisplayName = claims.user_metadata?.display_name;

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    displayName:
      typeof metadataDisplayName === "string" ? metadataDisplayName : null,
  };
}
