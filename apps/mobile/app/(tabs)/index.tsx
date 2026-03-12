import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { api } from "../lib/api";
import { getCurrentCoords } from "../lib/location";
import { dialEmergencyUK } from "../lib/sos";

type SosStartError = {
  code: "location-permission-denied" | "backend-unreachable" | "alert-creation-failed";
  title: string;
  message: string;
};

function toSosStartError(error: unknown): SosStartError {
  const message = error instanceof Error ? error.message : "Unknown error";
  const normalizedMessage = message.toLowerCase();

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
    title: "Could not create your SOS alert",
    message:
      message === "Unknown error"
        ? "Please try again. If this keeps happening, restart the app and verify the backend is running."
        : message,
  };
}

export default function SosScreen() {
  const [activeAlertId, setActiveAlertId] = useState<number | null>(null);
  const [contactsCount, setContactsCount] = useState<number>(0);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<SosStartError | null>(null);
  const [websocketError, setWebsocketError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isIntentionalWsCloseRef = useRef(false);

  const wsUrl = useMemo(() => {
    const base = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000")
      .replace("http://", "ws://")
      .replace("https://", "wss://");

    // Same localhost caveat for Android emulator applies as in api.ts
    return base.replace("ws://localhost", "ws://10.0.2.2");
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const contacts = await api.contacts.list();
        setContactsCount(Array.isArray(contacts) ? contacts.length : 0);
      } catch {
        setContactsCount(0);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      isIntentionalWsCloseRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  function connectToAlertChannel(alertId: number) {
    isIntentionalWsCloseRef.current = false;
    setWebsocketError(null);

    const socket = new WebSocket(`${wsUrl}/ws/alerts/${alertId}`);

    socket.onopen = () => {
      setWebsocketError(null);
    };

    socket.onerror = () => {
      setWebsocketError(
        "Live updates are not connected right now. Contacts may not receive live status changes until the connection is restored."
      );
    };

    socket.onclose = () => {
      if (wsRef.current === socket) {
        wsRef.current = null;
      }

      if (!isIntentionalWsCloseRef.current) {
        setWebsocketError(
          "Live connection lost. You can still use SOS, but live updates may not reach listeners until the connection is restored."
        );
      }
    };

    wsRef.current = socket;
  }

  async function startSOS() {
    setIsStarting(true);
    setStartError(null);
    setWebsocketError(null);

    try {
      const coords = await getCurrentCoords();
      const created = await api.alerts.create(coords?.lat, coords?.lng);
      setActiveAlertId(created.id);
      setStartError(null);

      connectToAlertChannel(created.id);

      // UK: no direct emergency API. MVP opens dialer.
      dialEmergencyUK();

      Alert.alert(
        "SOS started",
        `Dialer opened to 999. Trusted contacts saved: ${contactsCount}. (Notifications wiring is next.)`
      );
    } catch (error) {
      setStartError(toSosStartError(error));
    } finally {
      setIsStarting(false);
    }
  }

  async function pushLocationUpdate() {
    if (!activeAlertId) return;
    try {
      const coords = await getCurrentCoords();
      await api.alerts.updateLocation(activeAlertId, coords.lat, coords.lng);
      wsRef.current?.send(JSON.stringify({ type: "location", ...coords, alert_id: activeAlertId }));
      Alert.alert("Updated", "Location sent.");
    } catch (e: any) {
      Alert.alert("Update failed", e?.message || "Unknown error");
    }
  }

  async function resolveSOS() {
    if (!activeAlertId) return;
    try {
      await api.alerts.resolve(activeAlertId);
      isIntentionalWsCloseRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
      setActiveAlertId(null);
      setWebsocketError(null);
      Alert.alert("Resolved", "SOS ended.");
    } catch (e: any) {
      Alert.alert("Resolve failed", e?.message || "Unknown error");
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, gap: 14, justifyContent: "center" }}>
      <Text style={{ fontSize: 28, fontWeight: "700" }}>Guardian Circle</Text>
      <Text style={{ opacity: 0.8 }}>One tap to start an SOS and share location.</Text>

      {!activeAlertId ? (
        <>
          <View style={{ padding: 12, borderRadius: 14, borderWidth: 1 }}>
            <Text style={{ fontWeight: "700" }}>Trusted contacts</Text>
            <Text style={{ opacity: 0.85 }}>
              {contactsCount} saved. Add more in the Contacts tab.
            </Text>
          </View>

          {startError ? (
            <View
              style={{
                padding: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#b00020",
                backgroundColor: "#fff4f4",
                gap: 4,
              }}
            >
              <Text style={{ color: "#7f0000", fontWeight: "700" }}>{startError.title}</Text>
              <Text style={{ color: "#7f0000", opacity: 0.9 }}>{startError.message}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={startSOS}
            disabled={isStarting}
            style={{
              padding: 18,
              borderRadius: 16,
              alignItems: "center",
              backgroundColor: "#b00020",
              opacity: isStarting ? 0.7 : 1,
            }}
          >
            <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>
              {isStarting ? "Starting SOS..." : "SOS"}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={{ padding: 14, borderRadius: 16, backgroundColor: "#111", gap: 6 }}>
            <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
              Active alert #{activeAlertId}
            </Text>
            <Text style={{ color: "white", opacity: 0.85 }}>
              Tap “Update Location” to send fresh coordinates.
            </Text>
            {websocketError ? (
              <View
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#ff8a80",
                  backgroundColor: "#3a0d0d",
                  gap: 4,
                }}
              >
                <Text style={{ color: "#ffd7d4", fontWeight: "700" }}>
                  Live connection unavailable
                </Text>
                <Text style={{ color: "#ffd7d4", opacity: 0.95 }}>{websocketError}</Text>
              </View>
            ) : null}
          </View>

          <Pressable
            onPress={pushLocationUpdate}
            style={{ padding: 14, borderRadius: 16, alignItems: "center", backgroundColor: "#333" }}
          >
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
              Update Location
            </Text>
          </Pressable>

          <Pressable
            onPress={resolveSOS}
            style={{ padding: 14, borderRadius: 16, alignItems: "center", backgroundColor: "#1b5e20" }}
          >
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
              I’m Safe (End SOS)
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
