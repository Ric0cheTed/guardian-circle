import React, { useMemo, useRef, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { api } from "../lib/api";
import { getCurrentCoords } from "../lib/location";
import { dialEmergencyUK } from "../lib/sos";

export default function Home() {
  const [activeAlertId, setActiveAlertId] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const wsUrl = useMemo(() => {
    const base = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000")
      .replace("http://", "ws://")
      .replace("https://", "wss://");
    return base;
  }, []);

  async function startSOS() {
    try {
      const coords = await getCurrentCoords().catch(() => null);
      const created = await api.alerts.create(coords?.lat, coords?.lng);
      setActiveAlertId(created.id);

      // Realtime: open WS and periodically push location updates
      const ws = new WebSocket(`${wsUrl}/ws/alerts/${created.id}`);
      wsRef.current = ws;

      ws.onopen = () => {};
      ws.onerror = () => {
        Alert.alert("Live updates unavailable", "Connection issues detected. Use Update Location manually.");
      };

      try {
        await dialEmergencyUK();
      } catch (error: any) {
        Alert.alert(
          "Emergency dialer unavailable",
          error?.message || "Please call emergency services manually."
        );
      }

      Alert.alert(
        "SOS started",
        "Emergency dialer opened. Your trusted contacts will receive updates in the next step (we’ll wire notifications next)."
      );
    } catch (e: any) {
      Alert.alert("Could not start SOS", e.message || "Unknown error");
    }
  }

  async function pushLocationUpdate() {
    if (!activeAlertId) return;
    try {
      const coords = await getCurrentCoords();
      const updated = await api.alerts.updateLocation(activeAlertId, coords.lat, coords.lng);
      wsRef.current?.send(JSON.stringify({ type: "location", ...coords, alert_id: activeAlertId }));
      return updated;
    } catch (e: any) {
      Alert.alert("Location update failed", e?.message || "Please try again.");
    }
  }

  async function resolveSOS() {
    if (!activeAlertId) return;
    try {
      await api.alerts.resolve(activeAlertId);
      wsRef.current?.close();
      wsRef.current = null;
      setActiveAlertId(null);
      Alert.alert("Resolved", "SOS ended.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Unknown error");
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, gap: 16, justifyContent: "center" }}>
      <Text style={{ fontSize: 28, fontWeight: "700" }}>Guardian Circle</Text>
      <Text style={{ fontSize: 16, opacity: 0.8 }}>
        Big button. Fast help. Location updates for your circle.
      </Text>

      {!activeAlertId ? (
        <Pressable
          onPress={startSOS}
          style={{
            padding: 18,
            borderRadius: 16,
            alignItems: "center",
            backgroundColor: "#b00020",
          }}
        >
          <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>SOS</Text>
        </Pressable>
      ) : (
        <>
          <View style={{ padding: 14, borderRadius: 16, backgroundColor: "#111", gap: 8 }}>
            <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
              Active alert #{activeAlertId}
            </Text>
            <Text style={{ color: "white", opacity: 0.85 }}>
              Tap “Update Location” to send fresh coords (we’ll automate background updates next).
            </Text>
          </View>

          <Pressable
            onPress={pushLocationUpdate}
            style={{ padding: 14, borderRadius: 16, alignItems: "center", backgroundColor: "#333" }}
          >
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>Update Location</Text>
          </Pressable>

          <Pressable
            onPress={resolveSOS}
            style={{ padding: 14, borderRadius: 16, alignItems: "center", backgroundColor: "#1b5e20" }}
          >
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>I’m Safe (End SOS)</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
