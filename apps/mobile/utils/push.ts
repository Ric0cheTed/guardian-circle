import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const PUSH_PROJECT_ID = process.env.EXPO_PUBLIC_PUSH_PROJECT_ID?.trim() ?? "";
const ANDROID_NOTIFICATION_CHANNEL_ID = "guardian-circle-sos";

export function isPushConfigured() {
  return PUSH_PROJECT_ID.length > 0;
}

export async function registerForWatcherPushNotificationsAsync() {
  if (!isPushConfigured()) {
    throw new Error("Push notifications are not configured for this build.");
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
      name: "Guardian Circle SOS",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#b00020",
    });
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let status = existingPermissions.status;

  if (status !== "granted") {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    status = requestedPermissions.status;
  }

  if (status !== "granted") {
    throw new Error("Allow notifications to receive Guardian Circle SOS alerts on this device.");
  }

  const expoPushToken = await Notifications.getExpoPushTokenAsync({
    projectId: PUSH_PROJECT_ID,
  });

  return expoPushToken.data;
}
