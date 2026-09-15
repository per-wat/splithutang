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
import {
  emptyLearningProgress,
  getCombinedOnboardingProgress,
  getHomeOnboardingSection,
  getLearningProgress,
  parseLearningProgress,
} from "../src/lib/onboarding/learning.ts";

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

test("a new user starts with actionable Learn the Basics guidance", async () => {
  const learning = parseLearningProgress({
    has_group: false,
    has_shared_expense: false,
    has_payment: false,
  });
  const component = await readFile(
    "src/components/onboarding/learning-basics.tsx",
    "utf8",
  );

  assert.deepEqual(learning, emptyLearningProgress);
  assert.deepEqual(getLearningProgress(learning), {
    ...emptyLearningProgress,
    completedCount: 0,
    complete: false,
    totalCount: 3,
  });
  assert.match(component, /Create or join a group/);
  assert.match(component, /Create a group/);
  assert.match(component, /invitation link/);
});

test("real group, shared expense and payment signals complete each learning step", () => {
  const groupOnly = parseLearningProgress({
    has_group: true,
    has_shared_expense: false,
    has_payment: false,
  });
  const withExpense = parseLearningProgress({
    has_group: true,
    has_shared_expense: true,
    has_payment: false,
  });
  const complete = parseLearningProgress({
    has_group: true,
    has_shared_expense: true,
    has_payment: true,
  });

  assert.equal(getLearningProgress(groupOnly).completedCount, 1);
  assert.equal(getLearningProgress(withExpense).completedCount, 2);
  assert.deepEqual(getLearningProgress(complete), {
    ...complete,
    completedCount: 3,
    complete: true,
    totalCount: 3,
  });
});

test("setup and learning progress advance together without keeping a completed Home card", () => {
  const learning = {
    hasGroup: true,
    hasSharedExpense: true,
    hasPayment: false,
  };

  assert.equal(
    getHomeOnboardingSection({ setupComplete: false, learning }),
    "setup",
  );
  assert.equal(
    getHomeOnboardingSection({ setupComplete: true, learning }),
    "learning",
  );
  assert.deepEqual(
    getCombinedOnboardingProgress({
      setupCompletedCount: 2,
      setupTotalCount: 2,
      learning,
    }),
    { completedCount: 4, totalCount: 5, complete: false },
  );
  assert.equal(
    getHomeOnboardingSection({
      setupComplete: true,
      learning: { ...learning, hasPayment: true },
    }),
    null,
  );
});

test("learning progress is derived per authenticated user from real activity", async () => {
  const migration = await readFile(
    "supabase/migrations/20260915040041_add_onboarding_progress.sql",
    "utf8",
  );

  assert.match(migration, /security invoker/);
  assert.match(migration, /person\.linked_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /target_group\.owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /membership\.membership_status = 'active'/);
  assert.match(migration, /other_participant\.person_id <> expense\.paid_by/);
  assert.match(migration, /public\.expense_payments/);
  assert.match(migration, /public\.iou_payments/);
  assert.match(migration, /payment\.status in \('pending', 'confirmed'\)/);
  assert.match(migration, /to authenticated/);
  assert.doesNotMatch(migration, /get_onboarding_progress\s*\([^)]*[a-z_]+/i);
});

test("Home loads learning progress once inside its existing parallel request", async () => {
  const home = await readFile("src/app/page.tsx", "utf8");
  const matches = home.match(/rpc\("get_onboarding_progress"\)/g) ?? [];

  assert.equal(matches.length, 1);
  assert.match(
    home,
    /Promise\.all\([\s\S]*rpc\("get_onboarding_progress"\)[\s\S]*\]\)/,
  );
  assert.doesNotMatch(home, /channel\(|on\("postgres_changes"/);
});

test("permanent help remains accessible and examples never write financial data", async () => {
  const [profile, page, learning, help] = await Promise.all([
    readFile("src/app/profile/page.tsx", "utf8"),
    readFile("src/app/getting-started/page.tsx", "utf8"),
    readFile("src/components/onboarding/learning-basics.tsx", "utf8"),
    readFile("src/components/onboarding/how-splithutang-works.tsx", "utf8"),
  ]);

  assert.match(profile, /href="\/getting-started"/);
  assert.match(page, /GettingStartedExperience/);
  assert.match(learning, /You&apos;re ready to use SplitHutang/);
  assert.match(help, /How SplitHutang works/);
  assert.match(help, /RM120 for dinner/);
  assert.doesNotMatch(`${learning}\n${help}`, /\.insert\(|\.upsert\(|\.delete\(/);
});
