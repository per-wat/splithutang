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
    "/payment-qr",
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
    readFile("src/app/payment-qr/page.tsx", "utf8"),
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

test("Groups keeps the app menu far-right and creates groups beside the Active list", async () => {
  const page = await readFile("src/app/groups/page.tsx", "utf8");
  const header = page.slice(0, page.indexOf("</header>"));
  const content = page.slice(page.indexOf("<section"));

  assert.ok(header.indexOf("<NotificationBell />") < header.indexOf("<AppMenu />"));
  assert.doesNotMatch(header, /href="\/groups\/new"/);
  assert.match(content, /Active/);
  assert.match(content, /New group/);
  assert.match(content, /Create Group/);
});

test("phone Back dismisses open navigation and add overlays before changing route", async () => {
  const [hook, menu, bottomNav] = await Promise.all([
    readFile("src/hooks/use-history-overlay.ts", "utf8"),
    readFile("src/components/layout/app-menu.tsx", "utf8"),
    readFile("src/components/layout/bottom-nav.tsx", "utf8"),
  ]);

  assert.match(hook, /window\.history\.pushState/);
  assert.match(hook, /addEventListener\("popstate"/);
  assert.match(hook, /window\.history\.back\(\)/);
  assert.match(menu, /useHistoryOverlay\("app-menu"\)/);
  assert.match(menu, /replace/);
  assert.match(bottomNav, /useHistoryOverlay\("add-menu"\)/);
  assert.match(bottomNav, /router\.replace\(href\)/);
});

test("page arrows use real history with route fallbacks and completed forms are replaced", async () => {
  const [backButton, profile, expenseDetail, addExpense, addIou, recurring, group] =
    await Promise.all([
      readFile("src/components/layout/app-back-button.tsx", "utf8"),
      readFile("src/app/profile/page.tsx", "utf8"),
      readFile("src/app/expenses/[id]/page.tsx", "utf8"),
      readFile("src/components/expenses/add-expense-form.tsx", "utf8"),
      readFile("src/components/ious/iou-form.tsx", "utf8"),
      readFile("src/components/recurring/recurring-form.tsx", "utf8"),
      readFile("src/components/groups/create-group-form.tsx", "utf8"),
    ]);

  assert.match(backButton, /router\.back\(\)/);
  assert.match(backButton, /router\.replace\(fallbackHref\)/);
  assert.match(profile, /<AppBackButton fallbackHref="\/"/);
  assert.match(expenseDetail, /<AppBackButton fallbackHref="\/expenses"/);

  assert.match(addExpense, /router\.replace\("\/expenses"\)/);
  assert.match(addIou, /router\.replace\("\/ious"\)/);
  assert.match(recurring, /router\.replace\(id \? `\/recurring\/\$\{id\}`/);
  assert.match(group, /router\.replace\(`\/groups\/\$\{groupId\}`\)/);
});
