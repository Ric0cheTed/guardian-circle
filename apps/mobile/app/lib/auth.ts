import AsyncStorage from "@react-native-async-storage/async-storage";
import { setToken } from "./api";

const KEY = "gc_token";

export async function loadToken(): Promise<string | null> {
  const t = await AsyncStorage.getItem(KEY);
  setToken(t);
  return t;
}

export async function saveToken(t: string): Promise<void> {
  await AsyncStorage.setItem(KEY, t);
  setToken(t);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  setToken(null);
}
