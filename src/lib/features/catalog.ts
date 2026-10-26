export const restrictedFeatures = [
  {
    key: "tax_receipts",
    label: "Tax receipts",
    description: "Save receipts for tax claims. Receipt storage will be added later.",
  },
] as const;

export type FeatureKey = (typeof restrictedFeatures)[number]["key"];

export function isFeatureKey(value: unknown): value is FeatureKey {
  return restrictedFeatures.some((feature) => feature.key === value);
}

export function resolveFeatureKeys(
  isOwner: boolean,
  grants: ReadonlyArray<{ feature_key: string; enabled: boolean }>,
): FeatureKey[] {
  return restrictedFeatures
    .filter((feature) => isOwner || grants.some(
      (grant) => grant.feature_key === feature.key && grant.enabled === true,
    ))
    .map((feature) => feature.key);
}

export function parseFeatureAccessChange(value: unknown):
  | { ok: true; userId: string; featureKey: FeatureKey; enabled: boolean }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "Feature access details are invalid." };
  }
  const input = value as Record<string, unknown>;
  if (typeof input.userId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.userId)) {
    return { ok: false, error: "Choose a registered user." };
  }
  if (!isFeatureKey(input.featureKey) || typeof input.enabled !== "boolean") {
    return { ok: false, error: "Choose a valid feature and access setting." };
  }
  return { ok: true, userId: input.userId, featureKey: input.featureKey, enabled: input.enabled };
}

export type FeatureAccessUser = {
  userId: string;
  displayName: string;
  email: string | null;
  featureKeys: FeatureKey[];
  isOwner: boolean;
};
