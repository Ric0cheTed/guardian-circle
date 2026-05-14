import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { LegalLinks } from "@/components/legal-links";
import { api } from "../lib/api";

export default function Register() {
  const router = useRouter();
  const [name, setName] = useState("Test User");
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("password123");
  const [loading, setLoading] = useState(false);

  async function onRegister() {
    setLoading(true);
    try {
      await api.auth.register(email.trim(), password, name.trim());
      Alert.alert("Registered", "Now log in with your credentials.");
      router.replace("../login");
    } catch (e: any) {
      Alert.alert("Register failed", e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 26, fontWeight: "700" }}>Create account</Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name"
        style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
      />

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
        onPress={onRegister}
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
          {loading ? "Creating..." : "Create Account"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        style={{ padding: 10, alignItems: "center" }}
      >
        <Text>Back to login</Text>
      </Pressable>

      <LegalLinks />
    </View>
  );
}
