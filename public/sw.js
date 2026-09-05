const allowedPath = /^\/(notifications|(?:expenses|ious|groups|people|invite)\/[0-9a-f-]{36})$/i;

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const path =
    payload.data && typeof payload.data.path === "string" && allowedPath.test(payload.data.path)
      ? payload.data.path
      : "/notifications";

  event.waitUntil(
    self.registration.showNotification(
      typeof payload.title === "string" ? payload.title : "SplitHutang update",
      {
        body: typeof payload.body === "string" ? payload.body : "Open SplitHutang to view the update.",
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        tag: typeof payload.tag === "string" ? payload.tag : undefined,
        data: { path },
      },
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawPath = event.notification.data?.path;
  const path = typeof rawPath === "string" && allowedPath.test(rawPath) ? rawPath : "/notifications";
  const destination = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) {
            return client.navigate(destination).then(() => client.focus());
          }
          return client.focus();
        }
      }

      return self.clients.openWindow(destination);
    }),
  );
});
