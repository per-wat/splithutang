const HOME_ROUTE = "/";

const HOME_CHILD_ROUTES = new Set([
  "/expenses",
  "/getting-started",
  "/groups",
  "/ious",
  "/notifications",
  "/payment-qr",
  "/people",
  "/profile",
  "/recurring",
  "/settings",
  "/usage",
]);

function normalizePathname(pathname: string) {
  if (pathname === HOME_ROUTE) return pathname;
  return pathname.replace(/\/+$/, "");
}

export function getParentRoute(pathname: string): string | null {
  const normalized = normalizePathname(pathname);

  if (normalized === HOME_ROUTE) return null;
  if (HOME_CHILD_ROUTES.has(normalized)) return HOME_ROUTE;

  if (normalized === "/add-expense") return "/expenses";
  if (normalized.startsWith("/expenses/")) return "/expenses";

  if (normalized === "/add-iou") return "/ious";
  if (normalized.startsWith("/ious/")) return "/ious";

  if (normalized === "/groups/new") return "/groups";
  if (normalized.startsWith("/groups/")) return "/groups";

  if (normalized.startsWith("/people/")) return "/people";

  if (normalized === "/recurring/new") return "/recurring";

  const recurringEditMatch = normalized.match(/^\/recurring\/([^/]+)\/edit$/);
  if (recurringEditMatch) {
    return `/recurring/${recurringEditMatch[1]}`;
  }

  if (/^\/recurring\/[^/]+$/.test(normalized)) return "/recurring";

  return null;
}
