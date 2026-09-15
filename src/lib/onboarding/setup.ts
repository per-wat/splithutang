export type DevicePlatform = "ios" | "android" | "other";

export type InstallSetupState =
  | "checking"
  | "complete"
  | "native_prompt"
  | "ios_guide"
  | "manual_guide";

export type NotificationSetupState =
  | "checking"
  | "complete"
  | "install_required"
  | "permission_default"
  | "permission_denied"
  | "subscription_missing"
  | "unsupported";

export function isStandaloneApp(input: {
  displayModeStandalone: boolean;
  navigatorStandalone?: boolean;
}) {
  return input.displayModeStandalone || input.navigatorStandalone === true;
}

export function detectDevicePlatform(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): DevicePlatform {
  if (
    /iPad|iPhone|iPod/i.test(input.userAgent) ||
    (input.platform === "MacIntel" && (input.maxTouchPoints ?? 0) > 1)
  ) {
    return "ios";
  }

  if (/Android/i.test(input.userAgent)) {
    return "android";
  }

  return "other";
}

export function isIosSafariBrowser(userAgent: string) {
  return (
    /Safari/i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent)
  );
}

export function getInstallSetupState(input: {
  standalone: boolean | null;
  platform: DevicePlatform | null;
  installPromptAvailable: boolean;
}): InstallSetupState {
  if (input.standalone === null || input.platform === null) return "checking";
  if (input.standalone) return "complete";
  if (input.platform === "ios") return "ios_guide";
  if (input.installPromptAvailable) return "native_prompt";
  return "manual_guide";
}

export function getNotificationSetupState(input: {
  supported: boolean | null;
  permission: NotificationPermission;
  subscribed: boolean;
  iosInstallRequired: boolean;
}): NotificationSetupState {
  if (input.supported === null) return "checking";
  if (!input.supported) return "unsupported";
  if (input.iosInstallRequired) return "install_required";
  if (input.permission === "denied") return "permission_denied";
  if (input.permission === "default") return "permission_default";
  if (input.subscribed) return "complete";
  return "subscription_missing";
}

export function getSetupProgress(input: {
  installState: InstallSetupState;
  notificationState: NotificationSetupState;
}) {
  const installed = input.installState === "complete";
  const notificationsEnabled = input.notificationState === "complete";

  return {
    installed,
    notificationsEnabled,
    completedCount: Number(installed) + Number(notificationsEnabled),
    complete: installed && notificationsEnabled,
    totalCount: 2,
  };
}
