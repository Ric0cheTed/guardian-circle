import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";

import { acknowledgeSafetyNotice } from "./lib/onboarding";
import { loadLaunchState } from "./lib/session";

type LaunchState = {
  token: string | null;
  hasAcknowledgedSafetyNotice: boolean;
};

const noticeItems = [
  {
    title: "What SOS does",
    body:
      "Guardian Circle helps you create an alert, share live location updates, and quickly start emergency action from your phone.",
  },
  {
    title: "999 dialer behavior",
    body:
      "Pressing SOS opens your phone dialer to 999 so you can decide whether to place the call yourself.",
  },
  {
    title: "Trusted contacts",
    body:
      "Your chosen contacts may receive your alert status and live location updates that you send during an active SOS.",
  },
  {
    title: "Important limits",
    body:
      "This app assists communication only. It does not contact authorities automatically, guarantee help, or guarantee accurate location sharing.",
  },
  {
    title: "Service reliability",
    body:
      "Battery loss, network issues, permissions, or weak GPS can interrupt service, and your location may not always be accurate.",
  },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [launchState, setLaunchState] = useState<LaunchState>({
    token: null,
    hasAcknowledgedSafetyNotice: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const nextState = await loadLaunchState();

        if (!mounted) {
          return;
        }

        setLaunchState(nextState);
      } finally {
        if (mounted) {
          setReady(true);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function continueToApp() {
    setSaving(true);
    try {
      await acknowledgeSafetyNotice();
      router.replace("../(tabs)");
    } catch (error: any) {
      Alert.alert(
        "Could not save acknowledgement",
        error?.message || "Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!launchState.token) {
    return <Redirect href="../login" />;
  }

  if (launchState.hasAcknowledgedSafetyNotice) {
    return <Redirect href="../(tabs)" />;
  }

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        padding: 20,
        gap: 16,
        justifyContent: "center",
      }}
    >
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 30, fontWeight: "700" }}>
          Before you use SOS
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 24, opacity: 0.82 }}>
          Read this once before using Guardian Circle. The app is designed to
          help you alert trusted contacts and quickly contact emergency
          services, but it cannot promise an outcome.
        </Text>
      </View>

      {noticeItems.map((item) => (
        <View
          key={item.title}
          style={{
            gap: 6,
            borderWidth: 1,
            borderColor: "#d0d7de",
            borderRadius: 16,
            padding: 16,
            backgroundColor: "#f7f9fb",
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: "700" }}>{item.title}</Text>
          <Text style={{ fontSize: 15, lineHeight: 22, opacity: 0.88 }}>
            {item.body}
          </Text>
        </View>
      ))}

      <View
        style={{
          borderRadius: 16,
          padding: 16,
          backgroundColor: "#111",
          gap: 8,
        }}
      >
        <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
          Acknowledge before continuing
        </Text>
        <Text style={{ color: "white", lineHeight: 22, opacity: 0.86 }}>
          Continuing confirms that you understand Guardian Circle is an
          assistive communication tool, the dialer opens to 999, and live
          location sharing may be delayed or inaccurate.
        </Text>
      </View>

      <Pressable
        onPress={continueToApp}
        disabled={saving}
        style={{
          padding: 16,
          borderRadius: 16,
          alignItems: "center",
          backgroundColor: "#b00020",
          opacity: saving ? 0.65 : 1,
        }}
      >
        <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
          {saving ? "Saving..." : "I understand and continue"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
