import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the app menu exposes every primary destination and keeps profile separate", async () => {
  const menu = await readFile("src/components/layout/app-menu.tsx", "utf8");

  for (const route of [
    "/",
    "/expenses",
    "/ious",
    "/recurring",
    "/people",
    "/groups",
    "/getting-started",
    "/settings",
  ]) {
    assert.match(menu, new RegExp(`href: "${route.replace("/", "\\/")}"`));
  }

  assert.match(menu, /href="\/profile"/);
  assert.match(menu, /Support &amp; setup/);
  assert.match(menu, /View profile/);
  assert.match(menu, /<Dialog\.Popup/);
});

test("every primary page header provides the navigation drawer", async () => {
  const files = await Promise.all([
    readFile("src/components/home/home-header.tsx", "utf8"),
    readFile("src/components/expenses/expenses-header.tsx", "utf8"),
    readFile("src/components/ious/ious-header.tsx", "utf8"),
    readFile("src/components/people/people-header.tsx", "utf8"),
    readFile("src/app/groups/page.tsx", "utf8"),
    readFile("src/app/recurring/page.tsx", "utf8"),
    readFile("src/app/notifications/page.tsx", "utf8"),
    readFile("src/app/getting-started/page.tsx", "utf8"),
    readFile("src/app/settings/page.tsx", "utf8"),
    readFile("src/app/profile/page.tsx", "utf8"),
  ]);

  for (const file of files) {
    assert.match(file, /<AppMenu/);
  }

  assert.doesNotMatch(files[0], /href="\/profile"/);
});

test("profile, settings, notifications and tutorials have clear responsibilities", async () => {
  const [profile, settings, gettingStarted, shell] = await Promise.all([
    readFile("src/app/profile/page.tsx", "utf8"),
    readFile("src/app/settings/page.tsx", "utf8"),
    readFile("src/app/getting-started/page.tsx", "utf8"),
    readFile("src/components/layout/app-route-shell.tsx", "utf8"),
  ]);

  assert.match(profile, /<ProfileSettingsForm/);
  assert.doesNotMatch(profile, /NotificationSettings/);
  assert.doesNotMatch(profile, /RestartGettingStarted/);
  assert.doesNotMatch(profile, /Getting Started/);

  assert.match(settings, /<AppInstallationSettings/);
  assert.match(settings, /<NotificationSettings/);
  assert.match(gettingStarted, /<RestartGettingStarted/);
  assert.match(shell, /"\/settings"/);
});
