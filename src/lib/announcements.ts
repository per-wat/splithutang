export const announcementCategories = [
  "new_feature",
  "information",
  "maintenance",
  "urgent",
] as const;

export type AnnouncementCategory = (typeof announcementCategories)[number];

export type AnnouncementPublishInput = {
  title: string;
  body: string;
  category: AnnouncementCategory;
  actionLabel: string | null;
  actionPath: string | null;
  expiresAt: string | null;
  sendPush: boolean;
};

export const announcementCategoryLabels: Record<
  AnnouncementCategory,
  string
> = {
  new_feature: "New feature",
  information: "Information",
  maintenance: "Maintenance",
  urgent: "Urgent",
};

export function isAnnouncementCategory(
  value: unknown,
): value is AnnouncementCategory {
  return announcementCategories.includes(value as AnnouncementCategory);
}

export function parseAnnouncementPublishInput(
  value: unknown,
  now = new Date(),
):
  | { ok: true; data: AnnouncementPublishInput }
  | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: "Announcement details are required." };
  }

  const title = asTrimmedString(value.title);
  const body = asTrimmedString(value.body);
  const actionLabel = asOptionalTrimmedString(value.actionLabel);
  const actionPath = asOptionalTrimmedString(value.actionPath);

  if (!title || title.length > 100) {
    return { ok: false, error: "Title must be between 1 and 100 characters." };
  }

  if (!body || body.length > 2000) {
    return {
      ok: false,
      error: "Message must be between 1 and 2,000 characters.",
    };
  }

  if (!isAnnouncementCategory(value.category)) {
    return { ok: false, error: "Choose a valid announcement type." };
  }

  if (actionLabel && actionLabel.length > 40) {
    return { ok: false, error: "Button label must be 40 characters or fewer." };
  }

  if (Boolean(actionLabel) !== Boolean(actionPath)) {
    return {
      ok: false,
      error: "Provide both a button label and an internal app path.",
    };
  }

  if (
    actionPath &&
    (actionPath.length > 500 ||
      !actionPath.startsWith("/") ||
      actionPath.startsWith("//"))
  ) {
    return {
      ok: false,
      error: "Button path must be an internal path such as /recurring.",
    };
  }

  let expiresAt: string | null = null;
  if (value.expiresAt !== null && value.expiresAt !== undefined && value.expiresAt !== "") {
    if (typeof value.expiresAt !== "string") {
      return { ok: false, error: "Expiry date is invalid." };
    }

    const expiry = new Date(value.expiresAt);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime()) {
      return { ok: false, error: "Expiry date must be in the future." };
    }
    expiresAt = expiry.toISOString();
  }

  return {
    ok: true,
    data: {
      title,
      body,
      category: value.category,
      actionLabel,
      actionPath,
      expiresAt,
      sendPush: value.sendPush === true,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalTrimmedString(value: unknown) {
  const trimmed = asTrimmedString(value);
  return trimmed || null;
}
