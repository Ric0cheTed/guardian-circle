import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, Alert, TextInput } from "react-native";
import { api, setToken } from "../lib/api";
import { getCurrentCoords } from "../lib/location";
import { dialEmergencyUK } from "../lib/sos";

const TOKEN_KEY = "guardian_token";

function readStoredToken() {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null) {
  try {
    if (typeof localStorage === "undefined") return;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export default function Home() {
  const [activeAlertId, setActiveAlertId] = useState<number | null>(null);
  const [email, setEmail] = useState("phase0@example.com");
  const [password, setPassword] = useState("secret123");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [statusText, setStatusText] = useState("idle");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const savedToken = readStoredToken();
    if (savedToken) {
      setToken(savedToken);
      setIsLoggedIn(true);
      setStatusText("session_restored");
    }
  }, []);

  const wsUrl = useMemo(() => {
    const base = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000")
      .replace("http://", "ws://")
      .replace("https://", "wss://");
    return base;
  }, []);

  async function login() {
    try {
      const result = await api.auth.login(email, password);
      setToken(result.access_token);
      writeStoredToken(result.access_token);
      setIsLoggedIn(true);
      setStatusText("logged_in");
      Alert.alert("Logged in", "Session saved on this device/browser.");
    } catch (e: any) {
      setStatusText("login_failed");
      Alert.alert("Login failed", e?.message || "Unknown error");
    }
  }

  function logout() {
    setToken(null);
    writeStoredToken(null);
    setIsLoggedIn(false);
    setActiveAlertId(null);
    setStatusText("logged_out");
    wsRef.current?.close();
    wsRef.current = null;
  }

  async function startSOS() {
    if (!isLoggedIn) {
      setStatusText("login_required");
      Alert.alert("Login required", "Sign in before starting SOS.");
      return;
    }

    try {
      const coords = await getCurrentCoords().catch(() => null);
      const created = await api.alerts.create(coords?.lat, coords?.lng);
      setActiveAlertId(created.id);
      setStatusText("sos_started");

      const ws = new WebSocket(`${wsUrl}/ws/alerts/${created.id}`);
      wsRef.current = ws;
      ws.onopen = () => {};
      ws.onerror = () => {
        Alert.alert("Live updates unavailable", "Connection issues detected. Use Update Location manually.");
      };

      try {
        await dialEmergencyUK();
      } catch (error: any) {
        Alert.alert("Emergency dialer unavailable", error?.message || "Please call emergency services manually.");
      }

      Alert.alert("SOS started", "Emergency dialer opened. Your trusted contacts will receive updates in the next step (we’ll wire notifications next).");
    } catch (e: any) {
      setStatusText("sos_failed");
      Alert.alert("Could not start SOS", e.message || "Unknown error");
    }
  }

  async function pushLocationUpdate() {
    if (!activeAlertId) return;
    try {
      const coords = await getCurrentCoords();
      const updated = await api.alerts.updateLocation(activeAlertId, coords.lat, coords.lng);
      wsRef.current?.send(JSON.stringify({ type: "location", ...coords, alert_id: activeAlertId }));
      setStatusText("location_updated");
      return updated;
    } catch (e: any) {
      setStatusText("location_update_failed");
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
      setStatusText("sos_resolved");
      Alert.alert("Resolved", "SOS ended.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Unknown error");
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, gap: 16, justifyContent: "center" }}>
      <Text style={{ fontSize: 28, fontWeight: "700" }}>Guardian Circle</Text>
      <Text style={{ fontSize: 16, opacity: 0.8 }}>Big button. Fast help. Location updates for your circle.</Text>
      <Text testID="status-text">Status: {statusText}</Text>

      <View style={{ gap: 8 }}>
        <TextInput testID="email-input" value={email} onChangeText={setEmail} autoCapitalize="none" placeholder="Email" style={{ borderWidth: 1, borderColor: "#bbb", borderRadius: 8, padding: 10 }} />
        <TextInput testID="password-input" value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" style={{ borderWidth: 1, borderColor: "#bbb", borderRadius: 8, padding: 10 }} />
        {!isLoggedIn ? (
          <Pressable testID="login-button" onPress={login} style={{ padding: 12, borderRadius: 10, backgroundColor: "#0d47a1" }}>
            <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>Login</Text>
          </Pressable>
        ) : (
          <Pressable testID="logout-button" onPress={logout} style={{ padding: 12, borderRadius: 10, backgroundColor: "#455a64" }}>
            <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>Logout</Text>
          </Pressable>
        )}
      </View>

      {!activeAlertId ? (
        <Pressable testID="sos-button" onPress={startSOS} style={{ padding: 18, borderRadius: 16, alignItems: "center", backgroundColor: "#b00020", opacity: isLoggedIn ? 1 : 0.5 }}>
          <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>SOS</Text>
        </Pressable>
      ) : (
        <>
          <View style={{ padding: 14, borderRadius: 16, backgroundColor: "#111", gap: 8 }}>
            <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>Active alert #{activeAlertId}</Text>
            <Text style={{ color: "white", opacity: 0.85 }}>Tap “Update Location” to send fresh coords (we’ll automate background updates next).</Text>
          </View>

          <Pressable testID="update-location-button" onPress={pushLocationUpdate} style={{ padding: 14, borderRadius: 16, alignItems: "center", backgroundColor: "#333" }}>
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>Update Location</Text>
          </Pressable>

          <Pressable testID="resolve-button" onPress={resolveSOS} style={{ padding: 14, borderRadius: 16, alignItems: "center", backgroundColor: "#1b5e20" }}>
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>I’m Safe (End SOS)</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
