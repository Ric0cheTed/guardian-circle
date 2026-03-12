import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "gc_safety_notice_acknowledged_at";

export async function hasAcknowledgedSafetyNotice(): Promise<boolean> {
  const acknowledgedAt = await AsyncStorage.getItem(KEY);
  return Boolean(acknowledgedAt);
}

export async function acknowledgeSafetyNotice(): Promise<void> {
  await AsyncStorage.setItem(KEY, new Date().toISOString());
}
