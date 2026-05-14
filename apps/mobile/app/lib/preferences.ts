import AsyncStorage from "@react-native-async-storage/async-storage";

const SOS_AUTO_SHARE_DEFAULT_ENABLED_STORAGE_KEY =
  "gc_sos_auto_share_default_enabled";
const SOS_TRUSTED_CONTACT_SHARE_DEFAULT_ENABLED_STORAGE_KEY =
  "gc_sos_trusted_contact_share_default_enabled";

export async function loadSosAutoShareDefaultEnabled() {
  const raw = await AsyncStorage.getItem(
    SOS_AUTO_SHARE_DEFAULT_ENABLED_STORAGE_KEY
  );

  if (raw === null) {
    return true;
  }

  return raw === "true";
}

export async function saveSosAutoShareDefaultEnabled(enabled: boolean) {
  await AsyncStorage.setItem(
    SOS_AUTO_SHARE_DEFAULT_ENABLED_STORAGE_KEY,
    String(enabled)
  );
}

export async function loadSosTrustedContactShareDefaultEnabled() {
  const raw = await AsyncStorage.getItem(
    SOS_TRUSTED_CONTACT_SHARE_DEFAULT_ENABLED_STORAGE_KEY
  );

  if (raw === null) {
    return true;
  }

  return raw === "true";
}

export async function saveSosTrustedContactShareDefaultEnabled(
  enabled: boolean
) {
  await AsyncStorage.setItem(
    SOS_TRUSTED_CONTACT_SHARE_DEFAULT_ENABLED_STORAGE_KEY,
    String(enabled)
  );
}
