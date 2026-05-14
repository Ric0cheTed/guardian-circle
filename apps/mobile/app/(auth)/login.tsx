import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { LegalLinks } from "@/components/legal-links";
import { api } from "../lib/api";
import { saveToken } from "../lib/auth";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("password123");
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    setLoading(true);
    try {
      const token = await api.auth.login(email.trim(), password);
      await saveToken(token.access_token);
      router.replace("/");
    } catch (e: any) {
      Alert.alert("Login failed", e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "700" }}>Guardian Circle</Text>
      <Text style={{ opacity: 0.8 }}>Sign in to use SOS + trusted contacts.</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
        style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Password"
        style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
      />

      <Pressable
        onPress={onLogin}
        disabled={loading}
        style={{
          padding: 14,
          borderRadius: 14,
          alignItems: "center",
          backgroundColor: "#111",
          opacity: loading ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
          {loading ? "Logging in..." : "Login"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("../register")}
        style={{ padding: 10, alignItems: "center" }}
      >
        <Text>Create an account</Text>
      </Pressable>

      <LegalLinks />
    </View>
  );
}
