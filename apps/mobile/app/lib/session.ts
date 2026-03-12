import { loadToken } from "./auth";
import { hasAcknowledgedSafetyNotice } from "./onboarding";

export async function loadLaunchState() {
  const [token, hasAcknowledgedSafetyNoticeValue] = await Promise.all([
    loadToken(),
    hasAcknowledgedSafetyNotice(),
  ]);

  return {
    token,
    hasAcknowledgedSafetyNotice: hasAcknowledgedSafetyNoticeValue,
  };
}
