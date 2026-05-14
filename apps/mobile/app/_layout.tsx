import React, { useCallback, useEffect, useRef } from "react";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const handledNotificationIdRef = useRef<string | null>(null);

  const openWatcherFromNotificationData = useCallback(
    (data: Record<string, unknown> | undefined) => {
      const watcherToken = data?.watcherToken;
      if (typeof watcherToken !== "string" || watcherToken.length === 0) {
        return;
      }

      router.push(`/watcher/${encodeURIComponent(watcherToken)}`);
    },
    [router]
  );

  useEffect(() => {
    const lastResponse = Notifications.getLastNotificationResponse();
    if (!lastResponse) {
      return;
    }

    const notificationId = lastResponse.notification.request.identifier;
    if (handledNotificationIdRef.current === notificationId) {
      return;
    }

    handledNotificationIdRef.current = notificationId;
    openWatcherFromNotificationData(
      lastResponse.notification.request.content.data as Record<string, unknown> | undefined
    );
  }, [openWatcherFromNotificationData]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const notificationId = response.notification.request.identifier;
      if (handledNotificationIdRef.current === notificationId) {
        return;
      }

      handledNotificationIdRef.current = notificationId;
      openWatcherFromNotificationData(
        response.notification.request.content.data as Record<string, unknown> | undefined
      );
    });

    return () => {
      subscription.remove();
    };
  }, [openWatcherFromNotificationData]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="legal" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
