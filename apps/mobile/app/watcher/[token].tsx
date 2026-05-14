import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

import { api } from "../lib/api";
import { isPushConfigured, registerForWatcherPushNotificationsAsync } from "@/utils/push";

const WATCHER_POLL_INTERVAL_MS = 15_000;

type WatcherAlert = {
  id: number;
  status: string;
  is_active: boolean;
  created_at: string;
  last_location_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  refreshed_at: string;
  supports_push_notifications: boolean;
  push_notifications_enabled: boolean;
};

type WatcherPushSubscriptionResponse = {
  ok: boolean;
  supports_push_notifications: boolean;
  push_notifications_enabled: boolean;
};

function formatDateTime(timestamp: string | null) {
  if (!timestamp) {
    return "Unavailable";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
}

function formatCoordinates(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) {
    return "Location has not been shared yet";
  }

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function getMapsUrl(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) {
    return null;
  }

  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function getStaticMapUrl(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) {
    return null;
  }

  return (
    "https://staticmap.openstreetmap.de/staticmap.php" +
    `?center=${lat},${lng}` +
    "&zoom=15&size=900x420" +
    `&markers=${lat},${lng},red-pushpin`
  );
}

function getStateLabel(alert: WatcherAlert) {
  if (alert.is_active) {
    return "Active";
  }

  if (alert.status === "resolved") {
    return "Safe";
  }

  return alert.status.charAt(0).toUpperCase() + alert.status.slice(1);
}

function getStateDescription(alert: WatcherAlert) {
  if (alert.is_active) {
    return "This alert is currently active.";
  }

  if (alert.status === "resolved") {
    return "This alert is no longer active. The user has marked themselves safe.";
  }

  if (alert.status === "expired") {
    return "This alert is no longer active. Guardian Circle closed it automatically after inactivity.";
  }

  return "This alert is no longer active.";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}

function toPushSubscriptionMessage(error: unknown) {
  const normalizedMessage = getErrorMessage(error).toLowerCase();

  if (normalizedMessage.includes("configured")) {
    return "Push alerts are not configured in this Guardian Circle build yet.";
  }

  if (
    normalizedMessage.includes("allow notifications") ||
    normalizedMessage.includes("permission")
  ) {
    return "Allow notifications on this device to receive Guardian Circle SOS alerts.";
  }

  if (normalizedMessage.includes("expo go") || normalizedMessage.includes("development build")) {
    return "Push alerts need a Guardian Circle development build or installed app on this device.";
  }

  if (
    normalizedMessage.includes("network request failed") ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("fetch failed")
  ) {
    return "Guardian Circle could not update push alerts right now. Check your connection and try again.";
  }

  return "Guardian Circle could not update push alerts right now. Please try again.";
}

export default function WatcherScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const watcherToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const [watcherAlert, setWatcherAlert] = useState<WatcherAlert | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);
  const pushConfigured = isPushConfigured();

  const mapUrl = useMemo(
    () =>
      watcherAlert
        ? getStaticMapUrl(watcherAlert.last_lat, watcherAlert.last_lng)
        : null,
    [watcherAlert]
  );
  const mapsUrl = useMemo(
    () =>
      watcherAlert
        ? getMapsUrl(watcherAlert.last_lat, watcherAlert.last_lng)
        : null,
    [watcherAlert]
  );

  const stateTone = useMemo(() => {
    if (!watcherAlert) {
      return { borderColor: "#d1d5db", backgroundColor: "#f9fafb", textColor: "#111827" };
    }

    return watcherAlert.is_active
      ? {
          borderColor: "#c62828",
          backgroundColor: "#190709",
          textColor: "#ffdddb",
        }
      : watcherAlert.status === "resolved"
        ? {
          borderColor: "#1b5e20",
          backgroundColor: "#eef7ef",
          textColor: "#1b5e20",
        }
        : {
            borderColor: "#d97706",
            backgroundColor: "#fff7ed",
            textColor: "#9a3412",
          };
  }, [watcherAlert]);

  const loadWatcherAlert = useCallback(
    async (initialLoad: boolean) => {
      if (!watcherToken) {
        setErrorMessage("This watcher link is missing or invalid.");
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (initialLoad) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const nextAlert = (await api.watcher.get(watcherToken)) as WatcherAlert;
        setWatcherAlert(nextAlert);
        setLastLoadedAt(new Date().toISOString());
        setErrorMessage(null);
      } catch {
        setErrorMessage(
          "This watcher view is unavailable. The link may be invalid, expired, or the alert may no longer be available."
        );
      } finally {
        if (initialLoad) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [watcherToken]
  );

  async function openInMaps() {
    if (!mapsUrl) {
      return;
    }

    try {
      await Linking.openURL(mapsUrl);
    } catch {
      Alert.alert(
        "Could not open Maps",
        "Guardian Circle could not open your map app right now. Please copy the coordinates and try again."
      );
    }
  }

  async function enablePushAlerts() {
    if (!watcherToken) {
      return;
    }

    setIsUpdatingPush(true);
    setPushStatusMessage(null);

    try {
      const expoPushToken = await registerForWatcherPushNotificationsAsync();
      const result = (await api.watcher.subscribePush(
        watcherToken,
        expoPushToken
      )) as WatcherPushSubscriptionResponse;
      setWatcherAlert((current) =>
        current
          ? {
              ...current,
              supports_push_notifications: result.supports_push_notifications,
              push_notifications_enabled: result.push_notifications_enabled,
            }
          : current
      );
      setPushStatusMessage(
        "Guardian Circle can now send new SOS alerts to this device for this trusted contact."
      );
    } catch (error) {
      setPushStatusMessage(toPushSubscriptionMessage(error));
    } finally {
      setIsUpdatingPush(false);
    }
  }

  async function disablePushAlerts() {
    if (!watcherToken) {
      return;
    }

    setIsUpdatingPush(true);
    setPushStatusMessage(null);

    try {
      const result = (await api.watcher.unsubscribePush(
        watcherToken
      )) as WatcherPushSubscriptionResponse;
      setWatcherAlert((current) =>
        current
          ? {
              ...current,
              supports_push_notifications: result.supports_push_notifications,
              push_notifications_enabled: result.push_notifications_enabled,
            }
          : current
      );
      setPushStatusMessage(
        "Guardian Circle will stop sending new SOS push alerts to this device for this trusted contact."
      );
    } catch (error) {
      setPushStatusMessage(toPushSubscriptionMessage(error));
    } finally {
      setIsUpdatingPush(false);
    }
  }

  useEffect(() => {
    void loadWatcherAlert(true);
  }, [loadWatcherAlert]);

  useEffect(() => {
    if (!watcherToken) {
      return;
    }

    const intervalId = setInterval(() => {
      void loadWatcherAlert(false);
    }, WATCHER_POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadWatcherAlert, watcherToken]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 16, justifyContent: "center" }}
      style={{ flex: 1 }}
    >
      <Stack.Screen options={{ title: "Watcher", headerShown: true }} />

      <Text style={{ fontSize: 26, fontWeight: "700" }}>Watcher View</Text>
      <Text style={{ opacity: 0.8, lineHeight: 20 }}>
        This screen is read-only. It can show the alert status and the latest location
        shared by Guardian Circle, but it cannot edit or resolve the alert.
      </Text>

      {isLoading ? (
        <View style={{ padding: 20, borderWidth: 1, borderRadius: 16, gap: 10, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ opacity: 0.8 }}>Loading watcher view...</Text>
        </View>
      ) : null}

      {!isLoading && errorMessage ? (
        <View
          style={{
            padding: 14,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#b00020",
            backgroundColor: "#fff4f4",
            gap: 6,
          }}
        >
          <Text style={{ color: "#7f0000", fontWeight: "700" }}>Watcher unavailable</Text>
          <Text style={{ color: "#7f0000", opacity: 0.95 }}>{errorMessage}</Text>
        </View>
      ) : null}

      {!isLoading && watcherAlert ? (
        <View
          style={{
            padding: 16,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: stateTone.borderColor,
            backgroundColor: stateTone.backgroundColor,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ color: stateTone.textColor, fontWeight: "700" }}>
              Alert #{watcherAlert.id}
            </Text>
            <Text style={{ color: stateTone.textColor, fontWeight: "800" }}>
              {getStateLabel(watcherAlert)}
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: stateTone.textColor, fontWeight: "700" }}>Alert state</Text>
            <Text style={{ color: stateTone.textColor, opacity: 0.92 }}>
              {getStateDescription(watcherAlert)}
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: stateTone.textColor, fontWeight: "700" }}>Latest location</Text>
            <Text style={{ color: stateTone.textColor, opacity: 0.92 }}>
              {formatCoordinates(watcherAlert.last_lat, watcherAlert.last_lng)}
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: stateTone.textColor, fontWeight: "700" }}>
              Last location update
            </Text>
            <Text style={{ color: stateTone.textColor, opacity: 0.92 }}>
              {formatDateTime(watcherAlert.last_location_at)}
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: stateTone.textColor, fontWeight: "700" }}>Started</Text>
            <Text style={{ color: stateTone.textColor, opacity: 0.92 }}>
              {formatDateTime(watcherAlert.created_at)}
            </Text>
          </View>

          <View style={{ gap: 10 }}>
            <Text style={{ color: stateTone.textColor, fontWeight: "700" }}>
              Map preview
            </Text>
            {mapUrl ? (
              <Image
                source={{ uri: mapUrl }}
                resizeMode="cover"
                style={{
                  width: "100%",
                  height: 220,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: stateTone.borderColor,
                  backgroundColor: watcherAlert.is_active
                    ? "#2b0f12"
                    : watcherAlert.status === "resolved"
                      ? "#dfeee0"
                      : "#ffedd5",
                }}
              />
            ) : (
              <View
                style={{
                  padding: 16,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: stateTone.borderColor,
                  backgroundColor: watcherAlert.is_active
                    ? "#2b0f12"
                    : watcherAlert.status === "resolved"
                      ? "#dfeee0"
                      : "#ffedd5",
                }}
              >
                <Text style={{ color: stateTone.textColor, opacity: 0.92 }}>
                  A map preview will appear after the alert owner shares a location.
                </Text>
              </View>
            )}
            {mapsUrl ? (
              <Pressable
                onPress={() => {
                  void openInMaps();
                }}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  alignItems: "center",
                  backgroundColor: watcherAlert.is_active
                    ? "#ffdddb"
                    : watcherAlert.status === "resolved"
                      ? "#1b5e20"
                      : "#d97706",
                }}
              >
                <Text
                  style={{
                    color:
                      watcherAlert.is_active
                        ? "#7f0000"
                        : "white",
                    fontWeight: "700",
                  }}
                >
                  Open in Maps
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: stateTone.textColor, fontWeight: "700" }}>Last server refresh</Text>
            <Text style={{ color: stateTone.textColor, opacity: 0.92 }}>
              {formatDateTime(watcherAlert.refreshed_at)}
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: stateTone.textColor, fontWeight: "700" }}>Last checked in app</Text>
            <Text style={{ color: stateTone.textColor, opacity: 0.92 }}>
              {formatDateTime(lastLoadedAt)}
            </Text>
          </View>

          <Text style={{ color: stateTone.textColor, opacity: 0.8, lineHeight: 20 }}>
            Guardian Circle is an assistive coordination tool. Location and service availability can vary.
          </Text>
        </View>
      ) : null}

      {!isLoading && watcherAlert?.supports_push_notifications ? (
        <View
          style={{
            padding: 16,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "#d1d5db",
            backgroundColor: "#f9fafb",
            gap: 10,
          }}
        >
          <Text style={{ fontWeight: "700", fontSize: 16 }}>Push alerts on this device</Text>
          <Text style={{ opacity: 0.85, lineHeight: 20 }}>
            Guardian Circle can notify this device when a new SOS is shared with you. Delivery depends on notification permissions, your device, and service availability.
          </Text>
          {!pushConfigured ? (
            <Text style={{ color: "#7f0000", lineHeight: 20 }}>
              Push alerts are not configured in this Guardian Circle build yet.
            </Text>
          ) : null}
          {pushStatusMessage ? (
            <Text style={{ color: "#374151", lineHeight: 20 }}>{pushStatusMessage}</Text>
          ) : null}
          <Pressable
            onPress={() => {
              if (watcherAlert.push_notifications_enabled) {
                void disablePushAlerts();
                return;
              }

              void enablePushAlerts();
            }}
            disabled={isUpdatingPush || !pushConfigured}
            style={{
              padding: 14,
              borderRadius: 16,
              alignItems: "center",
              backgroundColor: watcherAlert.push_notifications_enabled ? "#1f2937" : "#b00020",
              opacity: isUpdatingPush || !pushConfigured ? 0.7 : 1,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>
              {isUpdatingPush
                ? "Updating Push Alerts..."
                : watcherAlert.push_notifications_enabled
                  ? "Turn Off Push Alerts"
                  : "Turn On Push Alerts"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          void loadWatcherAlert(false);
        }}
        disabled={isLoading || isRefreshing}
        style={{
          padding: 14,
          borderRadius: 16,
          alignItems: "center",
          backgroundColor: "#111827",
          opacity: isLoading || isRefreshing ? 0.7 : 1,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700" }}>
          {isRefreshing ? "Refreshing..." : "Refresh Watcher View"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
