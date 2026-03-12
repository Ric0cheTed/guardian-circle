import React, { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { clearToken } from "../lib/auth";

export default function Settings() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await clearToken();
      router.replace("../login");
    } catch (e: any) {
      Alert.alert("Logout failed", e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, gap: 12, justifyContent: "center" }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>Settings</Text>
      <Text style={{ opacity: 0.8 }}>
        This is an MVP build. Next: contact notifications + live watcher view.
      </Text>

      <Pressable
        onPress={() =>
          Alert.alert(
            "Testing tip",
            "Android emulator cannot reach localhost. Use EXPO_PUBLIC_API_URL=http://10.0.2.2:8000 or set your PC LAN IP for physical devices."
          )
        }
        style={{ padding: 12, borderRadius: 14, alignItems: "center", backgroundColor: "#333" }}
      >
        <Text style={{ color: "white" }}>Network / emulator tip</Text>
      </Pressable>

      <Pressable
        onPress={logout}
        disabled={loading}
        style={{
          padding: 14,
          borderRadius: 14,
          alignItems: "center",
          backgroundColor: "#b00020",
          opacity: loading ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
          {loading ? "Logging out..." : "Logout"}
        </Text>
      </Pressable>
    </View>
  );
}
