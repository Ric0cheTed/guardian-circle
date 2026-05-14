import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, AppState, Pressable, ScrollView, Share, Text, View } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Location from "expo-location";

import { api } from "../lib/api";
import {
  describeBackgroundLocationShareError,
  getCurrentCoords,
  loadBackgroundLocationShareStatus,
  SOS_AUTO_SHARE_INTERVAL_MS,
  startSosBackgroundLocationSharing,
  stopSosBackgroundLocationSharing,
} from "../lib/location";
import {
  loadSosAutoShareDefaultEnabled,
  loadSosTrustedContactShareDefaultEnabled,
} from "../lib/preferences";
import { dialEmergencyUK } from "../lib/sos";

const ACTIVE_SOS_KEEP_AWAKE_TAG = "guardian-circle-active-sos";
const ACTIVE_SOS_SESSION_STORAGE_KEY = "gc_active_sos_session";
const BACKGROUND_AUTO_SHARE_STATUS_RECHECK_DELAY_MS = 13_000;
const CONTACT_EMERGENCY_HOLD_DELAY_MS = 1_800;

type InlineFailure = {
  title: string;
  message: string;
};

type SosStartError = {
  code: "location-permission-denied" | "backend-unreachable" | "alert-creation-failed";
  title: string;
  message: string;
};

type AutoShareMode = "off" | "starting" | "foreground-only" | "background";

type PersistedActiveSosSession = {
  alertId: number;
  lastSuccessfulLocationUpdateAt: string | null;
  autoShareMode: Exclude<AutoShareMode, "starting">;
};

type AlertSummary = {
  id: number;
  status: string;
  created_at: string;
  last_lat: number | null;
  last_lng: number | null;
};

type AlertNotificationSummary = {
  id: number;
  recipient_contact_id: number | null;
  recipient_name: string;
  recipient_phone: string;
  channel: string;
  status: string;
  watcher_url: string | null;
  sms_message: string | null;
  watcher_expires_at: string;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

type TrustedContactShareStatus =
  | "off"
  | "opening"
  | "shared"
  | "dismissed"
  | "no-contacts"
  | "failed";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function savePersistedActiveSosSession(
  session: PersistedActiveSosSession | null
) {
  if (!session) {
    await AsyncStorage.removeItem(ACTIVE_SOS_SESSION_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(
    ACTIVE_SOS_SESSION_STORAGE_KEY,
    JSON.stringify(session)
  );
}

async function loadPersistedActiveSosSession(): Promise<PersistedActiveSosSession | null> {
  const raw = await AsyncStorage.getItem(ACTIVE_SOS_SESSION_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedActiveSosSession>;

    if (typeof parsed.alertId !== "number") {
      throw new Error("Invalid SOS session");
    }

    const autoShareMode =
      parsed.autoShareMode === "foreground-only" ||
      parsed.autoShareMode === "background"
        ? parsed.autoShareMode
        : "off";

    return {
      alertId: parsed.alertId,
      lastSuccessfulLocationUpdateAt:
        typeof parsed.lastSuccessfulLocationUpdateAt === "string"
          ? parsed.lastSuccessfulLocationUpdateAt
          : null,
      autoShareMode,
    };
  } catch {
    await AsyncStorage.removeItem(ACTIVE_SOS_SESSION_STORAGE_KEY);
    return null;
  }
}

function formatLastLocationUpdate(timestamp: string | null) {
  if (!timestamp) {
    return "Waiting for first location share";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "Just now";
  }
}

function getMostRecentTimestamp(current: string | null, next: string | null) {
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  return new Date(next).getTime() > new Date(current).getTime() ? next : current;
}

function toBackgroundAutoShareFailure(lastError: string): InlineFailure {
  return {
    title: "Background auto-share issue",
    message: `${lastError} You can still send manual updates or turn auto-share off.`,
  };
}

function getRestoredActiveAlert(
  alerts: AlertSummary[],
  persistedSession: PersistedActiveSosSession | null
) {
  const persistedMatch = persistedSession
    ? alerts.find(
        (alert) =>
          alert.status === "active" && alert.id === persistedSession.alertId
      )
    : null;

  return persistedMatch ?? alerts.find((alert) => alert.status === "active") ?? null;
}

function getAutoShareStatusLabel(mode: AutoShareMode) {
  switch (mode) {
    case "starting":
      return "Starting...";
    case "foreground-only":
      return "On while open";
    case "background":
      return "On in background";
    default:
      return "Off";
  }
}

function getShareableTrustedContactNotification(
  notifications: AlertNotificationSummary[]
) {
  const preparedNotifications = notifications.filter(
    (notification) =>
      notification.channel === "sms" &&
      typeof notification.watcher_url === "string" &&
      notification.watcher_url.length > 0 &&
      typeof notification.sms_message === "string" &&
      notification.sms_message.length > 0
  );

  return (
    preparedNotifications.find((notification) => notification.status === "pending") ??
    preparedNotifications.find((notification) => notification.status === "sent") ??
    preparedNotifications[0] ??
    null
  );
}

function getTrustedContactShareStatusLabel(status: TrustedContactShareStatus) {
  switch (status) {
    case "opening":
      return "Opening...";
    case "shared":
      return "Opened";
    case "dismissed":
      return "Dismissed";
    case "no-contacts":
      return "No contacts";
    case "failed":
      return "Issue";
    default:
      return "Off";
  }
}

function toSosStartError(error: unknown): SosStartError {
  const normalizedMessage = getErrorMessage(error).toLowerCase();

  if (normalizedMessage.includes("location permission denied")) {
    return {
      code: "location-permission-denied",
      title: "Location access is required",
      message: "Allow location permission to start SOS and share your location with trusted contacts.",
    };
  }

  if (
    normalizedMessage.includes("network request failed") ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("fetch failed")
  ) {
    return {
      code: "backend-unreachable",
      title: "Could not reach Guardian Circle",
      message:
        "Check your connection and API address, then try again. SOS cannot start until the app can reach the backend.",
    };
  }

  return {
    code: "alert-creation-failed",
    title: "Could not start SOS",
    message:
      "Your SOS alert could not be created. Please try again. If this keeps happening, check that Guardian Circle is available and then retry.",
  };
}

function toLocationUpdateError(error: unknown): InlineFailure {
  const normalizedMessage = getErrorMessage(error).toLowerCase();

  if (normalizedMessage.includes("no longer active")) {
    return {
      title: "SOS session ended",
      message:
        "This SOS alert is no longer active. It may have closed automatically after inactivity. Start a new SOS if you still need help.",
    };
  }

  if (normalizedMessage.includes("location permission denied")) {
    return {
      title: "Location access is required",
      message: "Allow location permission to send your latest location to Guardian Circle.",
    };
  }

  if (
    normalizedMessage.includes("network request failed") ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("fetch failed")
  ) {
    return {
      title: "Could not send your location",
      message:
        "Guardian Circle could not be reached. Check your connection and API address, then try sending your location again.",
    };
  }

  if (normalizedMessage.includes("timed out")) {
    return {
      title: "Location update timed out",
      message:
        "Guardian Circle did not respond in time. Your latest location may not have been sent. Check your connection and try again.",
    };
  }

  return {
    title: "Location update failed",
    message: "Your latest location could not be sent. Please try again in a moment.",
  };
}

function InlineFailureCard({
  failure,
  dark,
}: {
  failure: InlineFailure;
  dark?: boolean;
}) {
  return (
    <View
      style={{
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: dark ? "#ff8a80" : "#b00020",
        backgroundColor: dark ? "#3a0d0d" : "#fff4f4",
        gap: 4,
      }}
    >
      <Text style={{ color: dark ? "#ffd7d4" : "#7f0000", fontWeight: "700" }}>
        {failure.title}
      </Text>
      <Text style={{ color: dark ? "#ffd7d4" : "#7f0000", opacity: 0.95 }}>
        {failure.message}
      </Text>
    </View>
  );
}

export default function SosScreen() {
  const [activeAlertId, setActiveAlertId] = useState<number | null>(null);
  const [contactsCount, setContactsCount] = useState<number>(0);
  const [isHydratingSession, setIsHydratingSession] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<SosStartError | null>(null);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [lastSuccessfulLocationUpdateAt, setLastSuccessfulLocationUpdateAt] = useState<string | null>(null);
  const [liveConnectionState, setLiveConnectionState] = useState<
    "idle" | "connecting" | "connected" | "issue"
  >("idle");
  const [websocketError, setWebsocketError] = useState<InlineFailure | null>(null);
  const [locationUpdateError, setLocationUpdateError] = useState<InlineFailure | null>(null);
  const [autoShareMode, setAutoShareMode] = useState<AutoShareMode>("off");
  const [autoShareMessage, setAutoShareMessage] = useState<InlineFailure | null>(null);
  const [trustedContactShareStatus, setTrustedContactShareStatus] =
    useState<TrustedContactShareStatus>("off");
  const [trustedContactShareMessage, setTrustedContactShareMessage] =
    useState<string | null>(null);
  const [isOpeningEmergencyDialer, setIsOpeningEmergencyDialer] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const isIntentionalWsCloseRef = useRef(false);
  const isUpdatingLocationRef = useRef(false);
  const autoShareIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backgroundAutoShareStatusTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushAutoShareLocationUpdateRef = useRef<() => void>(() => {});

  const wsUrl = useMemo(() => {
    const base = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000")
      .replace("http://", "ws://")
      .replace("https://", "wss://");

    return base.replace("ws://localhost", "ws://10.0.2.2");
  }, []);

  const loadContactsCount = useCallback(async () => {
    try {
      const contacts = await api.contacts.list();
      const nextCount = Array.isArray(contacts) ? contacts.length : 0;
      setContactsCount(nextCount);
      return nextCount;
    } catch {
      setContactsCount(0);
      return 0;
    }
  }, []);

  const syncBackgroundAutoShareState = useCallback(async () => {
    try {
      const status = await loadBackgroundLocationShareStatus();

      if (status.lastSharedAt) {
        setLastSuccessfulLocationUpdateAt((current) =>
          getMostRecentTimestamp(current, status.lastSharedAt)
        );
      }

      if (status.lastError) {
        setAutoShareMessage(toBackgroundAutoShareFailure(status.lastError));
        return;
      }

      if (status.isBackgroundTaskRunning) {
        setAutoShareMode("background");
        setAutoShareMessage(null);
      }
    } catch {
      // Background status sync is best-effort. Manual updates still work.
    }
  }, []);

  const queueBackgroundAutoShareStateRefresh = useCallback(() => {
    if (backgroundAutoShareStatusTimeoutRef.current) {
      clearTimeout(backgroundAutoShareStatusTimeoutRef.current);
    }

    backgroundAutoShareStatusTimeoutRef.current = setTimeout(() => {
      backgroundAutoShareStatusTimeoutRef.current = null;
      void syncBackgroundAutoShareState();
    }, BACKGROUND_AUTO_SHARE_STATUS_RECHECK_DELAY_MS);
  }, [syncBackgroundAutoShareState]);

  const connectToAlertChannel = useCallback(
    (alertId: number) => {
      isIntentionalWsCloseRef.current = false;
      setWebsocketError(null);
      setLiveConnectionState("connecting");

      let socket: WebSocket;

      try {
        socket = new WebSocket(`${wsUrl}/ws/alerts/${alertId}`);
      } catch {
        setLiveConnectionState("issue");
        setWebsocketError({
          title: "Live connection unavailable",
          message:
            "Live updates could not be connected. Your SOS alert is active, but listeners may not receive live status changes until the connection is restored.",
        });
        return;
      }

      socket.onopen = () => {
        setLiveConnectionState("connected");
        setWebsocketError(null);
      };

      socket.onerror = () => {
        setLiveConnectionState("issue");
        setWebsocketError({
          title: "Live connection unavailable",
          message:
            "Live updates are not connected right now. Contacts may not receive live status changes until the connection is restored.",
        });
      };

      socket.onclose = () => {
        if (wsRef.current === socket) {
          wsRef.current = null;
        }

        if (!isIntentionalWsCloseRef.current) {
          setLiveConnectionState("issue");
          setWebsocketError({
            title: "Live connection lost",
            message:
              "You can still use SOS, but live updates may not reach listeners until the connection is restored.",
          });
        } else {
          setLiveConnectionState("idle");
        }
      };

      wsRef.current = socket;
    },
    [wsUrl]
  );

  useEffect(() => {
    void loadContactsCount();
  }, [loadContactsCount]);

  useEffect(() => {
    let isCancelled = false;

    async function hydrateActiveSosSession() {
      setIsHydratingSession(true);

      try {
        const [persistedSession, alerts, backgroundStatus] = await Promise.all([
          loadPersistedActiveSosSession(),
          api.alerts.list() as Promise<AlertSummary[]>,
          loadBackgroundLocationShareStatus(),
        ]);

        if (isCancelled) {
          return;
        }

        const restoredAlert = getRestoredActiveAlert(
          Array.isArray(alerts) ? alerts : [],
          persistedSession
        );

        if (!restoredAlert) {
          setActiveAlertId(null);
          setLastSuccessfulLocationUpdateAt(null);
          setLiveConnectionState("idle");
          setWebsocketError(null);
          setLocationUpdateError(null);
          setAutoShareMode("off");
          setAutoShareMessage(null);
          setTrustedContactShareStatus("off");
          setTrustedContactShareMessage(null);
          await savePersistedActiveSosSession(null);
          return;
        }

        const restoredMode =
          backgroundStatus.isBackgroundTaskRunning
            ? "background"
            : persistedSession?.alertId === restoredAlert.id &&
                persistedSession.autoShareMode === "foreground-only"
              ? "foreground-only"
              : "off";

        setActiveAlertId(restoredAlert.id);
        setStartError(null);
        setLocationUpdateError(null);
        setAutoShareMode(restoredMode);
        setTrustedContactShareStatus("off");
        setTrustedContactShareMessage(null);
        setLastSuccessfulLocationUpdateAt(
          getMostRecentTimestamp(
            getMostRecentTimestamp(
              persistedSession?.alertId === restoredAlert.id
                ? persistedSession.lastSuccessfulLocationUpdateAt
                : null,
              restoredAlert.created_at
            ),
            backgroundStatus.lastSharedAt
          )
        );
        setAutoShareMessage(
          backgroundStatus.lastError
            ? toBackgroundAutoShareFailure(backgroundStatus.lastError)
            : null
        );

        connectToAlertChannel(restoredAlert.id);

        if (
          backgroundStatus.isBackgroundTaskRunning ||
          restoredMode !== "off" ||
          backgroundStatus.lastError
        ) {
          queueBackgroundAutoShareStateRefresh();
        }
      } catch {
        // If hydration fails, leave manual SOS available instead of blocking the user.
      } finally {
        if (!isCancelled) {
          setIsHydratingSession(false);
        }
      }
    }

    void hydrateActiveSosSession();

    return () => {
      isCancelled = true;
    };
  }, [connectToAlertChannel, queueBackgroundAutoShareStateRefresh]);

  useEffect(() => {
    isUpdatingLocationRef.current = isUpdatingLocation;
  }, [isUpdatingLocation]);

  useEffect(() => {
    if (isHydratingSession) {
      return;
    }

    const persistedMode = autoShareMode === "starting" ? "off" : autoShareMode;

    void savePersistedActiveSosSession(
      activeAlertId
        ? {
            alertId: activeAlertId,
            lastSuccessfulLocationUpdateAt,
            autoShareMode: persistedMode,
          }
        : null
    );
  }, [
    activeAlertId,
    autoShareMode,
    isHydratingSession,
    lastSuccessfulLocationUpdateAt,
  ]);

  useEffect(() => {
    return () => {
      isIntentionalWsCloseRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
      if (autoShareIntervalRef.current) {
        clearInterval(autoShareIntervalRef.current);
        autoShareIntervalRef.current = null;
      }
      if (backgroundAutoShareStatusTimeoutRef.current) {
        clearTimeout(backgroundAutoShareStatusTimeoutRef.current);
        backgroundAutoShareStatusTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!activeAlertId) {
      deactivateKeepAwake(ACTIVE_SOS_KEEP_AWAKE_TAG).catch(() => {});
      return;
    }

    activateKeepAwakeAsync(ACTIVE_SOS_KEEP_AWAKE_TAG).catch(() => {});

    return () => {
      deactivateKeepAwake(ACTIVE_SOS_KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [activeAlertId]);

  useEffect(() => {
    if (
      !activeAlertId ||
      autoShareMode === "off" ||
      autoShareMode === "starting"
    ) {
      if (autoShareIntervalRef.current) {
        clearInterval(autoShareIntervalRef.current);
        autoShareIntervalRef.current = null;
      }
      return;
    }

    if (autoShareIntervalRef.current) {
      clearInterval(autoShareIntervalRef.current);
    }

    autoShareIntervalRef.current = setInterval(() => {
      pushAutoShareLocationUpdateRef.current();
    }, SOS_AUTO_SHARE_INTERVAL_MS);

    return () => {
      if (autoShareIntervalRef.current) {
        clearInterval(autoShareIntervalRef.current);
        autoShareIntervalRef.current = null;
      }
    };
  }, [activeAlertId, autoShareMode]);

  useEffect(() => {
    if (!activeAlertId) {
      if (backgroundAutoShareStatusTimeoutRef.current) {
        clearTimeout(backgroundAutoShareStatusTimeoutRef.current);
        backgroundAutoShareStatusTimeoutRef.current = null;
      }
      return;
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void syncBackgroundAutoShareState();
        queueBackgroundAutoShareStateRefresh();
      }
    });

    void syncBackgroundAutoShareState();
    queueBackgroundAutoShareStateRefresh();

    return () => {
      subscription.remove();
      if (backgroundAutoShareStatusTimeoutRef.current) {
        clearTimeout(backgroundAutoShareStatusTimeoutRef.current);
        backgroundAutoShareStatusTimeoutRef.current = null;
      }
    };
  }, [activeAlertId, queueBackgroundAutoShareStateRefresh, syncBackgroundAutoShareState]);

  async function startSOS() {
    if (isHydratingSession) {
      return;
    }

    setIsStarting(true);
    setStartError(null);
    setWebsocketError(null);
    setLocationUpdateError(null);
    setLastSuccessfulLocationUpdateAt(null);
    setLiveConnectionState("idle");
    setAutoShareMode("off");
    setAutoShareMessage(null);
    setTrustedContactShareStatus("off");
    setTrustedContactShareMessage(null);

    if (autoShareIntervalRef.current) {
      clearInterval(autoShareIntervalRef.current);
      autoShareIntervalRef.current = null;
    }

    await stopSosBackgroundLocationSharing().catch(() => {});

    try {
      const coords = await getCurrentCoords();
      const created = await api.alerts.create(coords.lat, coords.lng);
      const [shouldStartAutoShare, shouldOpenTrustedContactShare, currentContactsCount] =
        await Promise.all([
          loadSosAutoShareDefaultEnabled(),
          loadSosTrustedContactShareDefaultEnabled(),
          loadContactsCount(),
        ]);
      setActiveAlertId(created.id);
      setLastSuccessfulLocationUpdateAt(new Date().toISOString());
      setStartError(null);

      connectToAlertChannel(created.id);

      if (shouldStartAutoShare) {
        await startAutoShareForAlert(created.id);
      }

      if (shouldOpenTrustedContactShare) {
        void openTrustedContactShare(created.id, currentContactsCount);
      } else {
        setTrustedContactShareStatus("off");
        setTrustedContactShareMessage(
          "Trusted contact sharing is off in Settings."
        );
      }
    } catch (error) {
      setStartError(toSosStartError(error));
    } finally {
      setIsStarting(false);
    }
  }

  async function pushLocationUpdate(options?: {
    silent?: boolean;
    accuracy?: Location.LocationAccuracy;
  }) {
    if (!activeAlertId || isUpdatingLocationRef.current) {
      return;
    }

    isUpdatingLocationRef.current = true;
    setIsUpdatingLocation(true);
    setLocationUpdateError(null);

    try {
      const coords = await getCurrentCoords({ accuracy: options?.accuracy });
      await api.alerts.updateLocation(activeAlertId, coords.lat, coords.lng);
      setLastSuccessfulLocationUpdateAt(new Date().toISOString());

      try {
        if (wsRef.current?.readyState === 1) {
          wsRef.current.send(JSON.stringify({ type: "location", ...coords, alert_id: activeAlertId }));
        } else if (wsRef.current) {
          setWebsocketError({
            title: "Live connection unavailable",
            message:
              "Your location was saved, but live listeners may not receive updates until the connection is restored.",
          });
        }
      } catch {
        setWebsocketError({
          title: "Live connection unavailable",
          message:
            "Your location was saved, but live listeners may not receive updates until the connection is restored.",
        });
      }

      setLocationUpdateError(null);
      if (!options?.silent) {
        Alert.alert("Updated", "Location sent.");
      }
    } catch (error) {
      setLocationUpdateError(toLocationUpdateError(error));
    } finally {
      isUpdatingLocationRef.current = false;
      setIsUpdatingLocation(false);
    }
  }

  async function startAutoShareForAlert(alertId: number) {
    setAutoShareMode("starting");
    setAutoShareMessage(null);

    try {
      const result = await startSosBackgroundLocationSharing(alertId);
      setAutoShareMode(result.mode);

      if (result.mode === "foreground-only" && result.message) {
        setAutoShareMessage({
          title: "Background auto-share unavailable",
          message: result.message,
        });
      } else {
        setAutoShareMessage(null);
      }
    } catch (error) {
      setAutoShareMode("off");
      setAutoShareMessage(describeBackgroundLocationShareError(error));
    }
  }

  async function enableAutoShare() {
    if (!activeAlertId) {
      return;
    }

    await startAutoShareForAlert(activeAlertId);
  }

  function confirmEnableAutoShare() {
    Alert.alert(
      "Turn on auto-share?",
      "Guardian Circle can send a location update every 60 seconds during this SOS. If you allow background location, updates can continue while the app is not on screen. You can turn this off at any time.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Turn on",
          onPress: () => {
            void enableAutoShare();
          },
        },
      ]
    );
  }

  async function disableAutoShare() {
    if (autoShareIntervalRef.current) {
      clearInterval(autoShareIntervalRef.current);
      autoShareIntervalRef.current = null;
    }

    setAutoShareMode("off");
    setAutoShareMessage(null);

    try {
      await stopSosBackgroundLocationSharing();
    } catch {
      setAutoShareMessage({
        title: "Could not stop auto-share",
        message:
          "Manual location updates are still available. If automatic updates continue, close and reopen Guardian Circle before starting SOS again.",
      });
    }
  }

  async function openEmergencyDialer() {
    if (isOpeningEmergencyDialer) {
      return;
    }

    setIsOpeningEmergencyDialer(true);

    try {
      await dialEmergencyUK();
    } catch {
      Alert.alert(
        "Could not open the 999 dialer",
        "Open your phone app and dial 999 manually if you need emergency help right now."
      );
    } finally {
      setIsOpeningEmergencyDialer(false);
    }
  }

  async function openTrustedContactShare(
    alertId: number,
    currentContactsCount = contactsCount
  ) {
    if (currentContactsCount <= 0) {
      setTrustedContactShareStatus("no-contacts");
      setTrustedContactShareMessage(
        "Add at least one trusted contact in the Contacts tab before using automatic trusted contact sharing."
      );
      return;
    }

    setTrustedContactShareStatus("opening");
    setTrustedContactShareMessage(
      currentContactsCount === 1
        ? "Choose SMS, WhatsApp, or another app to send the backend-prepared watcher link."
        : "Choose SMS, WhatsApp, or another app to send the backend-prepared watcher link. Automatic per-contact delivery is still coming."
    );

    try {
      const notifications = (await api.alerts.listNotifications(
        alertId
      )) as AlertNotificationSummary[];
      const shareableNotification = getShareableTrustedContactNotification(
        Array.isArray(notifications) ? notifications : []
      );

      if (!shareableNotification) {
        setTrustedContactShareStatus("failed");
        setTrustedContactShareMessage(
          "Guardian Circle could not load the trusted contact watcher message. Your SOS alert is still active."
        );
        return;
      }

      const message = shareableNotification.sms_message;
      const watcherUrl = shareableNotification.watcher_url;

      if (!message || !watcherUrl) {
        setTrustedContactShareStatus("failed");
        setTrustedContactShareMessage(
          "Guardian Circle could not load the trusted contact watcher message. Your SOS alert is still active."
        );
        return;
      }

      const shareResult = await Share.share({
        title: "Guardian Circle SOS alert",
        message,
        url: watcherUrl,
      });

      if (shareResult.action === Share.dismissedAction) {
        setTrustedContactShareStatus("dismissed");
        setTrustedContactShareMessage(
          "The trusted contact share sheet was closed before anything was sent."
        );
        return;
      }

      setTrustedContactShareStatus("shared");
      setTrustedContactShareMessage(
        currentContactsCount === 1
          ? "Guardian Circle opened your phone's share flow with the backend-prepared watcher link."
          : "Guardian Circle opened your phone's share flow with a backend-prepared watcher link. Dedicated per-contact delivery is still coming."
      );
    } catch {
      setTrustedContactShareStatus("failed");
      setTrustedContactShareMessage(
        "Guardian Circle could not open the trusted contact share flow. Your SOS alert is still active."
      );
    }
  }

  async function resolveSOS() {
    if (!activeAlertId) {
      return;
    }

    try {
      await api.alerts.resolve(activeAlertId);
      if (autoShareIntervalRef.current) {
        clearInterval(autoShareIntervalRef.current);
        autoShareIntervalRef.current = null;
      }
      await stopSosBackgroundLocationSharing().catch(() => {});
      isIntentionalWsCloseRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
      setActiveAlertId(null);
      setLastSuccessfulLocationUpdateAt(null);
      setLiveConnectionState("idle");
      setWebsocketError(null);
      setLocationUpdateError(null);
      setAutoShareMode("off");
      setAutoShareMessage(null);
      setTrustedContactShareStatus("off");
      setTrustedContactShareMessage(null);
      await savePersistedActiveSosSession(null);
      Alert.alert("Resolved", "SOS ended.");
    } catch {
      Alert.alert("Could not end SOS", "Please try again. Your alert is still active until it is resolved.");
    }
  }

  pushAutoShareLocationUpdateRef.current = () => {
    void pushLocationUpdate({
      silent: true,
      accuracy: Location.Accuracy.Balanced,
    });
  };

  if (!activeAlertId) {
    return (
      <View
        style={{
          flex: 1,
          padding: 20,
          gap: 14,
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: "700" }}>Guardian Circle</Text>
        <Text style={{ opacity: 0.8 }}>One tap to start an SOS and share location.</Text>

        <View style={{ padding: 12, borderRadius: 14, borderWidth: 1 }}>
          <Text style={{ fontWeight: "700" }}>Trusted contacts</Text>
          <Text style={{ opacity: 0.85 }}>
            {contactsCount} saved. Add more in the Contacts tab.
          </Text>
        </View>

        {isHydratingSession ? (
          <View style={{ padding: 12, borderRadius: 14, borderWidth: 1, gap: 4 }}>
            <Text style={{ fontWeight: "700" }}>Checking for an active SOS</Text>
            <Text style={{ opacity: 0.85 }}>
              If you already have an alert in progress, Guardian Circle will restore it here.
            </Text>
          </View>
        ) : null}

        {startError ? <InlineFailureCard failure={startError} /> : null}

        <Pressable
          onPress={startSOS}
          disabled={isStarting || isHydratingSession}
          style={{
            padding: 18,
            borderRadius: 16,
            alignItems: "center",
            backgroundColor: "#b00020",
            opacity: isStarting || isHydratingSession ? 0.7 : 1,
          }}
        >
          <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>
            {isHydratingSession
              ? "Checking active SOS..."
              : isStarting
                ? "Starting SOS..."
                : "SOS"}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 20, gap: 14 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: 14,
          paddingBottom: 12,
        }}
        showsVerticalScrollIndicator
      >
        <Text style={{ fontSize: 28, fontWeight: "700" }}>Guardian Circle</Text>
        <Text style={{ opacity: 0.8 }}>One tap to start an SOS and share location.</Text>

        <View
          style={{
            padding: 16,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "#c62828",
            backgroundColor: "#190709",
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: "#b00020",
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: "#ffd7d4",
                }}
              />
              <Text style={{ color: "white", fontSize: 12, fontWeight: "800" }}>LIVE</Text>
            </View>
            <Text style={{ color: "#ffcccb", fontWeight: "700" }}>Alert #{activeAlertId}</Text>
          </View>

          <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>
            Active SOS session
          </Text>

          <Text style={{ color: "white", opacity: 0.86, lineHeight: 22 }}>
            Your alert is active. Guardian Circle can share the location updates you send, and your screen will stay awake while this SOS is active.
          </Text>

          <View
            style={{
              padding: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#ffab91",
              backgroundColor: "#32181b",
              gap: 10,
            }}
          >
            <Text style={{ color: "#ffd7d4", fontWeight: "700" }}>
              Need emergency services now?
            </Text>
            <Text style={{ color: "white", opacity: 0.9, lineHeight: 20 }}>
              Guardian Circle does not contact emergency services automatically. Press and hold the button below to open your phone dialer to 999.
            </Text>
            <Pressable
              onLongPress={() => {
                void openEmergencyDialer();
              }}
              delayLongPress={CONTACT_EMERGENCY_HOLD_DELAY_MS}
              disabled={isOpeningEmergencyDialer}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: 16,
                alignItems: "center",
                backgroundColor: "#ffd7d4",
                opacity: isOpeningEmergencyDialer ? 0.7 : 1,
                gap: 2,
              }}
            >
              <Text style={{ color: "#7f0000", fontSize: 16, fontWeight: "800" }}>
                {isOpeningEmergencyDialer
                  ? "Opening 999..."
                  : "Press and Hold to Contact 999"}
              </Text>
              <Text style={{ color: "#7f0000", opacity: 0.8 }}>
                Hold for about 2 seconds to open the dialer
              </Text>
            </Pressable>
          </View>

          <View
            style={{
              padding: 12,
              borderRadius: 14,
              backgroundColor: "#2b0f12",
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ color: "#ffcccb", opacity: 0.9 }}>Live channel</Text>
              <Text
                style={{
                  color:
                    liveConnectionState === "connected"
                      ? "#8bcf9b"
                      : liveConnectionState === "connecting"
                        ? "#ffd166"
                        : "#ffab91",
                  fontWeight: "700",
                }}
              >
                {liveConnectionState === "connected"
                  ? "Connected"
                  : liveConnectionState === "connecting"
                    ? "Connecting..."
                    : "Connection issue"}
              </Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ color: "#ffcccb", opacity: 0.9 }}>Last location sent</Text>
              <Text style={{ color: "white", fontWeight: "700" }}>
                {formatLastLocationUpdate(lastSuccessfulLocationUpdateAt)}
              </Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ color: "#ffcccb", opacity: 0.9 }}>
                Auto-share every {SOS_AUTO_SHARE_INTERVAL_MS / 1000}s
              </Text>
              <Text
                style={{
                  color:
                    autoShareMode === "background" || autoShareMode === "foreground-only"
                      ? "#8bcf9b"
                      : autoShareMode === "starting"
                        ? "#ffd166"
                        : "#ffcccb",
                  fontWeight: "700",
                }}
              >
                {getAutoShareStatusLabel(autoShareMode)}
              </Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ color: "#ffcccb", opacity: 0.9 }}>
                Trusted contact share
              </Text>
              <Text
                style={{
                  color:
                    trustedContactShareStatus === "shared"
                      ? "#8bcf9b"
                      : trustedContactShareStatus === "opening"
                        ? "#ffd166"
                        : trustedContactShareStatus === "failed"
                          ? "#ffab91"
                          : "#ffcccb",
                  fontWeight: "700",
                }}
              >
                {getTrustedContactShareStatusLabel(trustedContactShareStatus)}
              </Text>
            </View>

            {trustedContactShareMessage ? (
              <Text style={{ color: "#ffcccb", opacity: 0.85, lineHeight: 20 }}>
                {trustedContactShareMessage}
              </Text>
            ) : null}
          </View>

          {autoShareMessage ? <InlineFailureCard failure={autoShareMessage} dark /> : null}
          {websocketError ? <InlineFailureCard failure={websocketError} dark /> : null}
          {locationUpdateError ? <InlineFailureCard failure={locationUpdateError} dark /> : null}
        </View>
      </ScrollView>

      <View style={{ gap: 12, paddingBottom: 12 }}>
        <Pressable
          onPress={() => {
            void pushLocationUpdate();
          }}
          disabled={isUpdatingLocation}
          style={{
            padding: 16,
            borderRadius: 18,
            alignItems: "center",
            backgroundColor: "#b00020",
            opacity: isUpdatingLocation ? 0.7 : 1,
          }}
        >
          <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
            {isUpdatingLocation ? "Sending Location..." : "Send Latest Location"}
          </Text>
        </Pressable>

        <Pressable
          onPress={resolveSOS}
          style={{
            padding: 14,
            borderRadius: 16,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#1b5e20",
            backgroundColor: "#eef7ef",
          }}
        >
          <Text style={{ color: "#1b5e20", fontSize: 16, fontWeight: "700" }}>
            {"I'm Safe (End SOS)"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            if (autoShareMode === "off") {
              confirmEnableAutoShare();
              return;
            }

            void disableAutoShare();
          }}
          disabled={autoShareMode === "starting"}
          style={{
            padding: 14,
            borderRadius: 16,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#ffab91",
            backgroundColor: "#32181b",
            opacity: autoShareMode === "starting" ? 0.7 : 1,
          }}
        >
          <Text style={{ color: "#ffd7d4", fontSize: 15, fontWeight: "700" }}>
            {autoShareMode === "starting"
              ? "Starting Auto-Share..."
              : autoShareMode === "off"
                ? `Turn On Auto-Share Every ${SOS_AUTO_SHARE_INTERVAL_MS / 1000}s`
                : "Turn Off Auto-Share"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
