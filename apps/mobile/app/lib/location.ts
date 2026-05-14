import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

const AUTH_TOKEN_STORAGE_KEY = "gc_token";
const BACKGROUND_LOCATION_TASK_NAME = "guardian-circle-sos-background-location";
const BACKGROUND_LOCATION_SESSION_KEY = "gc_background_location_session";
const BACKGROUND_LOCATION_LAST_SHARED_AT_KEY = "gc_background_location_last_shared_at";
const BACKGROUND_LOCATION_LAST_TASK_RUN_AT_KEY =
  "gc_background_location_last_task_run_at";
const BACKGROUND_LOCATION_LAST_ERROR_KEY = "gc_background_location_last_error";
const BACKGROUND_LOCATION_LAST_FAILURE_REASON_KEY =
  "gc_background_location_last_failure_reason";

export const SOS_AUTO_SHARE_INTERVAL_MS = 60_000;
const BACKGROUND_LOCATION_POST_TIMEOUT_MS = 12_000;

type BackgroundLocationSession = {
  alertId: number;
  apiUrl: string;
  token: string;
};

export type AutoShareStartResult = {
  mode: "foreground-only" | "background";
  message: string | null;
};

export type BackgroundLocationShareStatus = {
  isBackgroundTaskRunning: boolean;
  lastSharedAt: string | null;
  lastTaskRunAt: string | null;
  lastError: string | null;
  lastFailureReason: string | null;
};

function resolveApiUrl() {
  const raw = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

  if (Platform.OS === "android" && raw.includes("localhost")) {
    return raw.replace("localhost", "10.0.2.2");
  }

  return raw;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function saveBackgroundLocationSession(session: BackgroundLocationSession) {
  await AsyncStorage.setItem(BACKGROUND_LOCATION_SESSION_KEY, JSON.stringify(session));
}

async function loadBackgroundLocationSession(): Promise<BackgroundLocationSession | null> {
  const raw = await AsyncStorage.getItem(BACKGROUND_LOCATION_SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as BackgroundLocationSession;
  } catch {
    await AsyncStorage.removeItem(BACKGROUND_LOCATION_SESSION_KEY);
    return null;
  }
}

async function setBackgroundLocationLastSharedAt(timestamp: string | null) {
  if (!timestamp) {
    await AsyncStorage.removeItem(BACKGROUND_LOCATION_LAST_SHARED_AT_KEY);
    return;
  }

  await AsyncStorage.setItem(BACKGROUND_LOCATION_LAST_SHARED_AT_KEY, timestamp);
}

async function setBackgroundLocationLastTaskRunAt(timestamp: string | null) {
  if (!timestamp) {
    await AsyncStorage.removeItem(BACKGROUND_LOCATION_LAST_TASK_RUN_AT_KEY);
    return;
  }

  await AsyncStorage.setItem(BACKGROUND_LOCATION_LAST_TASK_RUN_AT_KEY, timestamp);
}

async function setBackgroundLocationLastError(message: string | null) {
  if (!message) {
    await AsyncStorage.removeItem(BACKGROUND_LOCATION_LAST_ERROR_KEY);
    return;
  }

  await AsyncStorage.setItem(BACKGROUND_LOCATION_LAST_ERROR_KEY, message);
}

async function setBackgroundLocationLastFailureReason(message: string | null) {
  if (!message) {
    await AsyncStorage.removeItem(BACKGROUND_LOCATION_LAST_FAILURE_REASON_KEY);
    return;
  }

  await AsyncStorage.setItem(BACKGROUND_LOCATION_LAST_FAILURE_REASON_KEY, message);
}

async function clearBackgroundLocationShareState() {
  await AsyncStorage.multiRemove([
    BACKGROUND_LOCATION_SESSION_KEY,
    BACKGROUND_LOCATION_LAST_SHARED_AT_KEY,
    BACKGROUND_LOCATION_LAST_TASK_RUN_AT_KEY,
    BACKGROUND_LOCATION_LAST_ERROR_KEY,
    BACKGROUND_LOCATION_LAST_FAILURE_REASON_KEY,
  ]);
}

async function postLocationUpdate(
  session: BackgroundLocationSession,
  lat: number,
  lng: number
) {
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => {
        controller.abort();
      }, BACKGROUND_LOCATION_POST_TIMEOUT_MS)
    : null;

  let res: Response;

  try {
    res = await fetch(`${session.apiUrl}/alerts/${session.alertId}/location`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ lat, lng }),
      signal: controller?.signal,
    });
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new Error("Background location update timed out");
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  const text = await res.text();

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(data?.detail || `Request failed (${res.status})`);
  }
}

function describeBackgroundLocationPostFailure(error: unknown) {
  const message = getErrorMessage(error);
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("timed out")) {
    return "Task ran, but the backend did not respond before the background update timeout.";
  }

  if (
    normalizedMessage.includes("network request failed") ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("fetch failed")
  ) {
    return "Task ran, but the backend could not be reached while posting the location update.";
  }

  if (
    normalizedMessage.includes("401") ||
    normalizedMessage.includes("403") ||
    normalizedMessage.includes("token") ||
    normalizedMessage.includes("sign in again")
  ) {
    return "Task ran, but the session token was rejected while posting the location update.";
  }

  return `Task ran, but posting the location update failed: ${message}`;
}

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK_NAME)) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
    BACKGROUND_LOCATION_TASK_NAME,
    async ({ data, error }) => {
      const taskRunAt = new Date().toISOString();

      await setBackgroundLocationLastTaskRunAt(taskRunAt);

      if (error) {
        await setBackgroundLocationLastFailureReason(
          `Task callback failed before posting a location update: ${getErrorMessage(error)}`
        );
        await setBackgroundLocationLastError(
          "Background auto-share is temporarily unavailable."
        );
        return;
      }

      const locations = data?.locations ?? [];
      const latestLocation = locations[locations.length - 1];

      if (!latestLocation) {
        await setBackgroundLocationLastFailureReason(
          "Task ran, but no location payload was delivered."
        );
        return;
      }

      const session = await loadBackgroundLocationSession();

      if (!session) {
        await setBackgroundLocationLastFailureReason(
          "Task ran, but no active background-sharing session was available."
        );
        await stopSosBackgroundLocationSharing();
        return;
      }

      try {
        await postLocationUpdate(
          session,
          latestLocation.coords.latitude,
          latestLocation.coords.longitude
        );
        await setBackgroundLocationLastSharedAt(taskRunAt);
        await setBackgroundLocationLastError(null);
        await setBackgroundLocationLastFailureReason(null);
      } catch (postError) {
        await setBackgroundLocationLastFailureReason(
          describeBackgroundLocationPostFailure(postError)
        );
        await setBackgroundLocationLastError(
          "Background auto-share could not send the latest location."
        );
      }
    }
  );
}

export async function getCurrentCoords(options?: {
  accuracy?: Location.LocationAccuracy;
}) {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Location permission denied");
  }

  const pos = await Location.getCurrentPositionAsync({
    accuracy: options?.accuracy ?? Location.Accuracy.High,
  });

  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

export async function startSosBackgroundLocationSharing(
  alertId: number
): Promise<AutoShareStartResult> {
  const foregroundPermission = await Location.requestForegroundPermissionsAsync();

  if (foregroundPermission.status !== "granted") {
    throw new Error("Location permission denied");
  }

  await setBackgroundLocationLastSharedAt(null);
  await setBackgroundLocationLastTaskRunAt(null);
  await setBackgroundLocationLastError(null);
  await setBackgroundLocationLastFailureReason(null);

  const taskManagerAvailable = await TaskManager.isAvailableAsync();
  const backgroundLocationAvailable = await Location.isBackgroundLocationAvailableAsync().catch(
    () => false
  );

  if (!taskManagerAvailable || !backgroundLocationAvailable) {
    return {
      mode: "foreground-only",
      message:
        "Background location sharing is not available in this build. Auto-share will continue every 60 seconds while Guardian Circle stays open.",
    };
  }

  const backgroundPermission = await Location.requestBackgroundPermissionsAsync();

  if (backgroundPermission.status !== "granted") {
    return {
      mode: "foreground-only",
      message:
        "Background location permission was not granted. Auto-share will continue every 60 seconds while Guardian Circle stays open.",
    };
  }

  const token = await AsyncStorage.getItem(AUTH_TOKEN_STORAGE_KEY);

  if (!token) {
    throw new Error("Sign in again to continue sharing location.");
  }

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK_NAME
  ).catch(() => false);

  if (alreadyRunning) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  }

  await saveBackgroundLocationSession({
    alertId,
    apiUrl: resolveApiUrl(),
    token,
  });

  try {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: SOS_AUTO_SHARE_INTERVAL_MS,
      deferredUpdatesInterval: SOS_AUTO_SHARE_INTERVAL_MS,
      deferredUpdatesTimeout: SOS_AUTO_SHARE_INTERVAL_MS,
      distanceInterval: 50,
      foregroundService:
        Platform.OS === "android"
          ? {
              notificationTitle: "Guardian Circle SOS active",
              notificationBody:
                "Background location sharing is active. Open Guardian Circle to stop it.",
              notificationColor: "#b00020",
            }
          : undefined,
      showsBackgroundLocationIndicator: Platform.OS === "ios",
    });
  } catch {
    await clearBackgroundLocationShareState();

    return {
      mode: "foreground-only",
      message:
        "Background sharing could not start in this build. Auto-share will continue every 60 seconds while Guardian Circle stays open.",
    };
  }

  return {
    mode: "background",
    message: null,
  };
}

export async function stopSosBackgroundLocationSharing() {
  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK_NAME
  ).catch(() => false);

  if (alreadyRunning) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  }

  await clearBackgroundLocationShareState();
}

export async function loadBackgroundLocationShareStatus(): Promise<BackgroundLocationShareStatus> {
  const [lastSharedAt, lastTaskRunAt, lastError, lastFailureReason] = await Promise.all([
    AsyncStorage.getItem(BACKGROUND_LOCATION_LAST_SHARED_AT_KEY),
    AsyncStorage.getItem(BACKGROUND_LOCATION_LAST_TASK_RUN_AT_KEY),
    AsyncStorage.getItem(BACKGROUND_LOCATION_LAST_ERROR_KEY),
    AsyncStorage.getItem(BACKGROUND_LOCATION_LAST_FAILURE_REASON_KEY),
  ]);

  const isBackgroundTaskRunning = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK_NAME
  ).catch(() => false);

  return {
    isBackgroundTaskRunning,
    lastSharedAt,
    lastTaskRunAt,
    lastError,
    lastFailureReason,
  };
}

export async function clearBackgroundLocationShareError() {
  await setBackgroundLocationLastError(null);
}

export function describeBackgroundLocationShareError(error: unknown) {
  const normalizedMessage = getErrorMessage(error).toLowerCase();

  if (normalizedMessage.includes("location permission denied")) {
    return {
      title: "Location access is required",
      message:
        "Allow location permission to turn on automatic location sharing during SOS.",
    };
  }

  if (
    normalizedMessage.includes("sign in again") ||
    normalizedMessage.includes("token")
  ) {
    return {
      title: "Sign in again to continue",
      message:
        "Guardian Circle could not confirm your session for background sharing. Sign in again, then retry auto-share.",
    };
  }

  return {
    title: "Could not start auto-share",
    message:
      "Automatic location sharing could not be started right now. You can still send manual updates during SOS.",
  };
}
