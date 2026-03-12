import { Redirect, Tabs } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { loadLaunchState } from "../lib/session";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [ready, setReady] = React.useState(false);
  const [token, setToken] = React.useState<string | null>(null);
  const [hasAcknowledgedSafetyNotice, setHasAcknowledgedSafetyNotice] =
    React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const nextState = await loadLaunchState();

        if (!mounted) {
          return;
        }

        setToken(nextState.token);
        setHasAcknowledgedSafetyNotice(nextState.hasAcknowledgedSafetyNotice);
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

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!token) {
    return <Redirect href="../login" />;
  }

  if (!hasAcknowledgedSafetyNotice) {
    return <Redirect href="../onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "SOS",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="exclamationmark.triangle.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: "Contacts",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
