import assert from "node:assert/strict";
import test from "node:test";

import type { JwtPayload } from "@supabase/supabase-js";

import { getVerifiedUser } from "../src/lib/supabase/auth.ts";

function claims(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    aal: "aal1",
    aud: "authenticated",
    exp: 2_000_000_000,
    iat: 1_900_000_000,
    iss: "https://example.supabase.co/auth/v1",
    role: "authenticated",
    session_id: "session-id",
    sub: "user-id",
    ...overrides,
  };
}

test("verified claims produce the user identity needed by server pages", async () => {
  const user = await getVerifiedUser({
    auth: {
      getClaims: async () => ({
        data: {
          claims: claims({
            email: "friend@example.com",
            user_metadata: { display_name: "Friend" },
          }),
        },
        error: null,
      }),
    },
  });

  assert.deepEqual(user, {
    id: "user-id",
    email: "friend@example.com",
    displayName: "Friend",
  });
});

test("missing or rejected claims are treated as unauthenticated", async () => {
  const missingClaims = await getVerifiedUser({
    auth: {
      getClaims: async () => ({ data: null, error: null }),
    },
  });
  const rejectedClaims = await getVerifiedUser({
    auth: {
      getClaims: async () => ({
        data: { claims: claims() },
        error: new Error("Invalid token"),
      }),
    },
  });

  assert.equal(missingClaims, null);
  assert.equal(rejectedClaims, null);
});

test("optional claim fields are normalized safely", async () => {
  const user = await getVerifiedUser({
    auth: {
      getClaims: async () => ({
        data: {
          claims: claims({
            email: undefined,
            user_metadata: { display_name: 123 },
          }),
        },
        error: null,
      }),
    },
  });

  assert.deepEqual(user, {
    id: "user-id",
    email: null,
    displayName: null,
  });
});
