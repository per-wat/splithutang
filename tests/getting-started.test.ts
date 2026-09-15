import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  detectDevicePlatform,
  getInstallSetupState,
  getNotificationSetupState,
  getSetupProgress,
  isIosSafariBrowser,
  isStandaloneApp,
} from "../src/lib/onboarding/setup.ts";

test("installed state uses both display mode and the iOS standalone flag", () => {
  assert.equal(
    isStandaloneApp({ displayModeStandalone: true }),
    true,
  );
  assert.equal(
    isStandaloneApp({
      displayModeStandalone: false,
      navigatorStandalone: true,
    }),
    true,
  );
  assert.equal(
    isStandaloneApp({
      displayModeStandalone: false,
      navigatorStandalone: false,
    }),
    false,
  );
});

test("iPhone, iPad desktop mode, Android and other devices are distinguished", () => {
  assert.equal(
    detectDevicePlatform({ userAgent: "Mozilla/5.0 (iPhone) Safari/605.1" }),
    "ios",
  );
  assert.equal(
    detectDevicePlatform({
      userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1",
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
    "ios",
  );
  assert.equal(
    detectDevicePlatform({ userAgent: "Mozilla/5.0 (Linux; Android 16) Chrome/153" }),
    "android",
  );
  assert.equal(
    detectDevicePlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/153" }),
    "other",
  );
});

test("iOS Safari is separated from Chrome on iOS for installation guidance", () => {
  assert.equal(isIosSafariBrowser("Mozilla/5.0 (iPhone) Safari/605.1"), true);
  assert.equal(
    isIosSafariBrowser("Mozilla/5.0 (iPhone) CriOS/153 Mobile/15E148 Safari/604.1"),
    false,
  );
});

test("Android install button only appears while the captured native prompt is available", () => {
  assert.equal(
    getInstallSetupState({
      standalone: false,
      platform: "android",
      installPromptAvailable: true,
    }),
    "native_prompt",
  );
  assert.equal(
    getInstallSetupState({
      standalone: false,
      platform: "android",
      installPromptAvailable: false,
    }),
    "manual_guide",
  );
  assert.equal(
    getInstallSetupState({
      standalone: false,
      platform: "ios",
      installPromptAvailable: true,
    }),
    "ios_guide",
  );
});

test("notification setup handles default, granted, denied and iOS install restrictions", () => {
  assert.equal(
    getNotificationSetupState({
      supported: true,
      permission: "default",
      subscribed: false,
      iosInstallRequired: false,
    }),
    "permission_default",
  );
  assert.equal(
    getNotificationSetupState({
      supported: true,
      permission: "granted",
      subscribed: false,
      iosInstallRequired: false,
    }),
    "subscription_missing",
  );
  assert.equal(
    getNotificationSetupState({
      supported: true,
      permission: "denied",
      subscribed: false,
      iosInstallRequired: false,
    }),
    "permission_denied",
  );
  assert.equal(
    getNotificationSetupState({
      supported: true,
      permission: "default",
      subscribed: false,
      iosInstallRequired: true,
    }),
    "install_required",
  );
});

test("permission plus an existing subscription completes notification setup", () => {
  const notificationState = getNotificationSetupState({
    supported: true,
    permission: "granted",
    subscribed: true,
    iosInstallRequired: false,
  });
  const progress = getSetupProgress({
    installState: "complete",
    notificationState,
  });

  assert.equal(notificationState, "complete");
  assert.deepEqual(progress, {
    installed: true,
    notificationsEnabled: true,
    completedCount: 2,
    complete: true,
    totalCount: 2,
  });
});

test("Getting Started reuses the global install listener and push endpoint", async () => {
  const [manager, experience, pushClient] = await Promise.all([
    readFile("src/components/pwa/pwa-manager.tsx", "utf8"),
    readFile(
      "src/components/onboarding/getting-started-experience.tsx",
      "utf8",
    ),
    readFile("src/lib/notifications/push-client.ts", "utf8"),
  ]);

  assert.match(manager, /beforeinstallprompt/);
  assert.doesNotMatch(experience, /beforeinstallprompt/);
  assert.match(pushClient, /\/api\/push\/subscriptions/);
  assert.match(experience, /useSetupStatus/);
});
