"use client";

import { usePushSubscription } from "@/hooks/use-push-subscription";
import {
  getInstallSetupState,
  getNotificationSetupState,
  getSetupProgress,
} from "@/lib/onboarding/setup";
import { usePwa } from "@/components/pwa/pwa-manager";

export function useSetupStatus() {
  const pwa = usePwa();
  const iosInstallRequired = pwa.platform === "ios" && pwa.standalone === false;
  const push = usePushSubscription({
    iosInstallRequired,
    autoSubscribeWhenGranted: true,
  });
  const installState = getInstallSetupState({
    standalone: pwa.standalone,
    platform: pwa.platform,
    installPromptAvailable: pwa.installPromptAvailable,
  });
  const notificationState = getNotificationSetupState({
    supported: push.supported,
    permission: push.permission,
    subscribed: Boolean(push.subscription),
    iosInstallRequired,
  });

  return {
    pwa,
    push,
    installState,
    notificationState,
    progress: getSetupProgress({ installState, notificationState }),
  };
}
