import React, { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";

import { api } from "../lib/api";

type Contact = {
  id: number;
  name: string;
  phone: string;
  is_emergency: boolean;
};

type Feedback = {
  tone: "success" | "error";
  message: string;
};

function normalizeUkPhone(phone: string) {
  return phone.replace(/[\s()-]/g, "").trim();
}

function isValidUkPhone(phone: string) {
  return /^(?:\+447\d{9}|07\d{9})$/.test(phone);
}

export default function Contacts() {
  const [items, setItems] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const data = await api.contacts.list();
      setItems(data);
    } catch {
      setFeedback({
        tone: "error",
        message: "Could not refresh trusted contacts right now. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addContact() {
    const trimmedName = name.trim();
    const normalizedPhone = normalizeUkPhone(phone);

    if (!trimmedName || !normalizedPhone) {
      setFeedback({
        tone: "error",
        message: "Enter a contact name and UK mobile number.",
      });
      return;
    }

    if (!isValidUkPhone(normalizedPhone)) {
      setFeedback({
        tone: "error",
        message: "Use a UK mobile number starting with +447 or 07.",
      });
      return;
    }

    if (items.some((item) => normalizeUkPhone(item.phone) === normalizedPhone)) {
      setFeedback({
        tone: "error",
        message: "That phone number is already saved as a trusted contact.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const created = await api.contacts.create(trimmedName, normalizedPhone, true);
      setItems((prev) => [created, ...prev]);
      setName("");
      setPhone("");
      setFeedback({
        tone: "success",
        message: `${created.name} was added to your trusted contacts.`,
      });
    } catch (error: any) {
      setFeedback({
        tone: "error",
        message: error?.message || "Could not add that trusted contact right now.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function removeContact(id: number, contactName: string) {
    setDeletingId(id);
    try {
      await api.contacts.remove(id);
      setItems((prev) => prev.filter((contact) => contact.id !== id));
      setFeedback({
        tone: "success",
        message: `${contactName} was removed from your trusted contacts.`,
      });
    } catch {
      setFeedback({
        tone: "error",
        message: "Could not remove that trusted contact right now.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>Trusted contacts</Text>
      <Text style={{ opacity: 0.8 }}>
        These people will be notified when SOS starts (notification sending is next).
      </Text>

      {feedback ? (
        <View
          style={{
            padding: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: feedback.tone === "success" ? "#1b5e20" : "#b00020",
            backgroundColor: feedback.tone === "success" ? "#eef7ef" : "#fff4f4",
          }}
        >
          <Text
            style={{
              color: feedback.tone === "success" ? "#1b5e20" : "#7f0000",
              fontWeight: "700",
            }}
          >
            {feedback.message}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: 10, padding: 12, borderWidth: 1, borderRadius: 14 }}>
        <Text style={{ fontWeight: "700" }}>Add contact</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name"
          style={{ borderWidth: 1, padding: 10, borderRadius: 12 }}
        />
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone (+447... or 07...)"
          keyboardType="phone-pad"
          style={{ borderWidth: 1, padding: 10, borderRadius: 12 }}
        />
        <Text style={{ opacity: 0.7 }}>Accepted formats: +447... or 07...</Text>
        <Pressable
          onPress={addContact}
          disabled={isSaving}
          style={{
            padding: 12,
            borderRadius: 12,
            alignItems: "center",
            backgroundColor: "#111",
            opacity: isSaving ? 0.7 : 1,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>
            {isSaving ? "Saving..." : "Add"}
          </Text>
        </Pressable>

        <Pressable onPress={refresh} style={{ padding: 10, alignItems: "center" }}>
          <Text>{loading ? "Refreshing..." : "Refresh list"}</Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(contact) => String(contact.id)}
        contentContainerStyle={{ gap: 10 }}
        ListEmptyComponent={
          loading ? null : (
            <View
              style={{
                padding: 16,
                borderRadius: 14,
                borderWidth: 1,
                borderStyle: "dashed",
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700" }}>No trusted contacts yet</Text>
              <Text style={{ opacity: 0.8 }}>
                Add at least one trusted contact so they can receive SOS updates you choose to share.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderWidth: 1, borderRadius: 14, gap: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: "700" }}>{item.name}</Text>
            <Text style={{ opacity: 0.85 }}>{item.phone}</Text>
            <Pressable
              onPress={() =>
                Alert.alert(
                  "Remove trusted contact?",
                  `${item.name} (${item.phone}) will no longer receive SOS updates you send from Guardian Circle.`,
                  [
                    { text: "Keep contact", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () => removeContact(item.id, item.name),
                    },
                  ]
                )
              }
              disabled={deletingId === item.id}
              style={{
                padding: 10,
                borderRadius: 12,
                alignItems: "center",
                backgroundColor: "#333",
                opacity: deletingId === item.id ? 0.7 : 1,
              }}
            >
              <Text style={{ color: "white" }}>
                {deletingId === item.id ? "Removing..." : "Delete"}
              </Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
