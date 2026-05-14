import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Alert, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { LegalLinks } from "@/components/legal-links";
import { clearToken } from "../lib/auth";
import { clearDeletedAccountLocalState } from "../lib/account";
import { api } from "../lib/api";
import {
  loadSosAutoShareDefaultEnabled,
  loadSosTrustedContactShareDefaultEnabled,
  saveSosAutoShareDefaultEnabled,
  saveSosTrustedContactShareDefaultEnabled,
} from "../lib/preferences";

export default function Settings() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isDeletingAlertHistory, setIsDeletingAlertHistory] = useState(false);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);
  const [isSavingAutoSharePreference, setIsSavingAutoSharePreference] =
    useState(false);
  const [isSavingTrustedContactSharePreference, setIsSavingTrustedContactSharePreference] =
    useState(false);
  const [startAutoShareByDefault, setStartAutoShareByDefault] = useState(true);
  const [openTrustedContactShareByDefault, setOpenTrustedContactShareByDefault] =
    useState(true);

  useEffect(() => {
    let isCancelled = false;

    async function loadPreference() {
      try {
        const [autoShareEnabled, trustedContactShareEnabled] =
          await Promise.all([
            loadSosAutoShareDefaultEnabled(),
            loadSosTrustedContactShareDefaultEnabled(),
          ]);

        if (!isCancelled) {
          setStartAutoShareByDefault(autoShareEnabled);
          setOpenTrustedContactShareByDefault(trustedContactShareEnabled);
        }
      } catch {
        if (!isCancelled) {
          Alert.alert(
            "Could not load settings",
            "Guardian Circle could not load your SOS settings. The default settings are on."
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingPreference(false);
        }
      }
    }

    void loadPreference();

    return () => {
      isCancelled = true;
    };
  }, []);

  async function toggleAutoShareDefault() {
    const nextValue = !startAutoShareByDefault;

    setIsSavingAutoSharePreference(true);

    try {
      await saveSosAutoShareDefaultEnabled(nextValue);
      setStartAutoShareByDefault(nextValue);
    } catch {
      Alert.alert(
        "Could not save setting",
        "Guardian Circle could not update your SOS auto-share preference. Please try again."
      );
    } finally {
      setIsSavingAutoSharePreference(false);
    }
  }

  async function toggleTrustedContactShareDefault() {
    const nextValue = !openTrustedContactShareByDefault;

    setIsSavingTrustedContactSharePreference(true);

    try {
      await saveSosTrustedContactShareDefaultEnabled(nextValue);
      setOpenTrustedContactShareByDefault(nextValue);
    } catch {
      Alert.alert(
        "Could not save setting",
        "Guardian Circle could not update your trusted contact share preference. Please try again."
      );
    } finally {
      setIsSavingTrustedContactSharePreference(false);
    }
  }

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

  async function deleteAccount() {
    setIsDeletingAccount(true);

    try {
      await api.auth.deleteAccount();
      await clearDeletedAccountLocalState();
      router.replace("../login");
      Alert.alert(
        "Account deleted",
        "Your Guardian Circle account, contacts, alerts, and watcher links were removed."
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Guardian Circle could not delete your account right now.";

      Alert.alert("Could not delete account", message);
    } finally {
      setIsDeletingAccount(false);
    }
  }

  async function deleteAlertHistory() {
    setIsDeletingAlertHistory(true);

    try {
      const result = await api.alerts.deleteHistory();
      const deletedAlerts =
        typeof result?.deleted_alerts === "number" ? result.deleted_alerts : 0;
      const deletedNotifications =
        typeof result?.deleted_notifications === "number"
          ? result.deleted_notifications
          : 0;
      const activeAlertsKept =
        typeof result?.active_alerts_kept === "number"
          ? result.active_alerts_kept
          : 0;

      const details =
        deletedAlerts > 0
          ? `Deleted ${deletedAlerts} past alert${
              deletedAlerts === 1 ? "" : "s"
            } and ${deletedNotifications} saved watcher record${
              deletedNotifications === 1 ? "" : "s"
            }.`
          : "There was no past alert history to remove.";
      const activeDetail =
        activeAlertsKept > 0
          ? " Any current active SOS stayed available."
          : "";

      Alert.alert("Alert history deleted", `${details}${activeDetail}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Guardian Circle could not delete your alert history right now.";

      Alert.alert("Could not delete alert history", message);
    } finally {
      setIsDeletingAlertHistory(false);
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your Guardian Circle account and removes your saved contacts, alerts, and watcher links. If an SOS is active, it will be removed. This cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => {
            void deleteAccount();
          },
        },
      ]
    );
  }

  function confirmDeleteAlertHistory() {
    Alert.alert(
      "Delete alert history?",
      "This removes resolved and expired alerts, along with saved watcher links, from Guardian Circle. It keeps any currently active SOS alert available. This cannot erase messages already sent from your phone or another service.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete alert history",
          style: "destructive",
          onPress: () => {
            void deleteAlertHistory();
          },
        },
      ]
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 12, justifyContent: "center" }}
    >
      <Text style={{ fontSize: 24, fontWeight: "700" }}>Settings</Text>
      <Text style={{ opacity: 0.8 }}>
        This is an MVP build. Next: contact notifications + live watcher view.
      </Text>

      <View
        style={{
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#d1d5db",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700" }}>
          Start auto-share automatically during SOS
        </Text>
        <Text style={{ opacity: 0.8, lineHeight: 20 }}>
          When this is on, Guardian Circle starts sending periodic location
          updates as soon as your SOS becomes active. You can still turn
          auto-share off during an alert.
        </Text>
        <Pressable
          onPress={() => {
            void toggleAutoShareDefault();
          }}
          disabled={isLoadingPreference || isSavingAutoSharePreference}
          style={{
            padding: 12,
            borderRadius: 14,
            alignItems: "center",
            backgroundColor: startAutoShareByDefault ? "#1b5e20" : "#4b5563",
            opacity:
              isLoadingPreference || isSavingAutoSharePreference ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>
            {isLoadingPreference
              ? "Loading..."
              : isSavingAutoSharePreference
                ? "Saving..."
                : startAutoShareByDefault
                  ? "On by default"
                  : "Off by default"}
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#d1d5db",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700" }}>
          Open trusted contact share when SOS starts
        </Text>
        <Text style={{ opacity: 0.8, lineHeight: 20 }}>
          When this is on, Guardian Circle prepares a read-only watcher link and
          opens your phone&apos;s share sheet as soon as SOS becomes active. You can
          then choose SMS, WhatsApp, or another app. Guardian Circle does not
          send messages silently in the background.
        </Text>
        <Pressable
          onPress={() => {
            void toggleTrustedContactShareDefault();
          }}
          disabled={
            isLoadingPreference || isSavingTrustedContactSharePreference
          }
          style={{
            padding: 12,
            borderRadius: 14,
            alignItems: "center",
            backgroundColor: openTrustedContactShareByDefault
              ? "#1b5e20"
              : "#4b5563",
            opacity:
              isLoadingPreference || isSavingTrustedContactSharePreference
                ? 0.6
                : 1,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>
            {isLoadingPreference
              ? "Loading..."
              : isSavingTrustedContactSharePreference
                ? "Saving..."
                : openTrustedContactShareByDefault
                  ? "Opens automatically"
                  : "Starts manually"}
          </Text>
        </Pressable>
      </View>

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

      <View
        style={{
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#d1d5db",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700" }}>
          Location and alert history
        </Text>
        <Text style={{ opacity: 0.8, lineHeight: 20 }}>
          Guardian Circle stores the latest location shared for each alert on
          that alert record. Resolved and expired alerts stay in your account
          until you delete alert history or delete your account.
        </Text>
        <Text style={{ opacity: 0.8, lineHeight: 20 }}>
          Deleting alert history removes past alerts and saved watcher links
          from Guardian Circle. It does not erase messages already sent from
          your phone or another messaging service.
        </Text>
        <Pressable
          onPress={confirmDeleteAlertHistory}
          disabled={loading || isDeletingAccount || isDeletingAlertHistory}
          style={{
            padding: 14,
            borderRadius: 14,
            alignItems: "center",
            backgroundColor: "#4b5563",
            opacity:
              loading || isDeletingAccount || isDeletingAlertHistory ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
            {isDeletingAlertHistory
              ? "Deleting alert history..."
              : "Delete alert history"}
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#d1d5db",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Legal</Text>
        <Text style={{ opacity: 0.8, lineHeight: 20 }}>
          Read the in-app terms and privacy text in an accessible format.
        </Text>
        <LegalLinks align="left" />
      </View>

      <View
        style={{
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#f3b7bd",
          backgroundColor: "#fff5f5",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#7f1d1d" }}>
          Delete account
        </Text>
        <Text style={{ opacity: 0.85, lineHeight: 20 }}>
          Permanently remove your Guardian Circle account and delete your saved
          contacts, alerts, and watcher links. This cannot be undone.
        </Text>
        <Pressable
          onPress={confirmDeleteAccount}
          disabled={loading || isDeletingAccount || isDeletingAlertHistory}
          style={{
            padding: 14,
            borderRadius: 14,
            alignItems: "center",
            backgroundColor: "#8b1e2d",
            opacity:
              loading || isDeletingAccount || isDeletingAlertHistory ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
            {isDeletingAccount ? "Deleting account..." : "Delete account"}
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={logout}
        disabled={loading || isDeletingAccount || isDeletingAlertHistory}
        style={{
          padding: 14,
          borderRadius: 14,
          alignItems: "center",
          backgroundColor: "#b00020",
          opacity:
            loading || isDeletingAccount || isDeletingAlertHistory ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
          {loading ? "Logging out..." : "Logout"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
