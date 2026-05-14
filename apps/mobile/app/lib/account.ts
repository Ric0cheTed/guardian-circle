import AsyncStorage from "@react-native-async-storage/async-storage";

import { setToken } from "./api";
import { stopSosBackgroundLocationSharing } from "./location";

const AUTH_TOKEN_STORAGE_KEY = "gc_token";
const ACTIVE_SOS_SESSION_STORAGE_KEY = "gc_active_sos_session";
const BACKGROUND_LOCATION_SESSION_KEY = "gc_background_location_session";
const BACKGROUND_LOCATION_LAST_SHARED_AT_KEY =
  "gc_background_location_last_shared_at";
const BACKGROUND_LOCATION_LAST_TASK_RUN_AT_KEY =
  "gc_background_location_last_task_run_at";
const BACKGROUND_LOCATION_LAST_ERROR_KEY = "gc_background_location_last_error";
const BACKGROUND_LOCATION_LAST_FAILURE_REASON_KEY =
  "gc_background_location_last_failure_reason";

export async function clearDeletedAccountLocalState() {
  try {
    await stopSosBackgroundLocationSharing();
  } catch {
    // Fall through and remove the stored session data directly.
  }

  await AsyncStorage.multiRemove([
    AUTH_TOKEN_STORAGE_KEY,
    ACTIVE_SOS_SESSION_STORAGE_KEY,
    BACKGROUND_LOCATION_SESSION_KEY,
    BACKGROUND_LOCATION_LAST_SHARED_AT_KEY,
    BACKGROUND_LOCATION_LAST_TASK_RUN_AT_KEY,
    BACKGROUND_LOCATION_LAST_ERROR_KEY,
    BACKGROUND_LOCATION_LAST_FAILURE_REASON_KEY,
  ]);

  setToken(null);
}
