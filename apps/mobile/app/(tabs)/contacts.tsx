import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, Alert } from "react-native";
import { api } from "../lib/api";

type Contact = {
  id: number;
  name: string;
  phone: string;
  is_emergency: boolean;
};

export default function Contacts() {
  const [items, setItems] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const data = await api.contacts.list();
      setItems(data);
    } catch (e: any) {
      Alert.alert("Failed to load contacts", e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addContact() {
    if (!name.trim() || !phone.trim()) {
      Alert.alert("Missing info", "Enter a name and phone number.");
      return;
    }
    try {
      const created = await api.contacts.create(name.trim(), phone.trim(), true);
      setItems((prev) => [created, ...prev]);
      setName("");
      setPhone("");
    } catch (e: any) {
      Alert.alert("Could not add contact", e?.message || "Unknown error");
    }
  }

  async function removeContact(id: number) {
    try {
      await api.contacts.remove(id);
      setItems((prev) => prev.filter((c) => c.id !== id));
    } catch (e: any) {
      Alert.alert("Could not delete", e?.message || "Unknown error");
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>Trusted contacts</Text>
      <Text style={{ opacity: 0.8 }}>
        These people will be notified when SOS starts (notification sending is next).
      </Text>

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
          placeholder="Phone (UK format)"
          keyboardType="phone-pad"
          style={{ borderWidth: 1, padding: 10, borderRadius: 12 }}
        />
        <Pressable
          onPress={addContact}
          style={{ padding: 12, borderRadius: 12, alignItems: "center", backgroundColor: "#111" }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Add</Text>
        </Pressable>

        <Pressable onPress={refresh} style={{ padding: 10, alignItems: "center" }}>
          <Text>{loading ? "Refreshing..." : "Refresh list"}</Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderWidth: 1, borderRadius: 14, gap: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: "700" }}>{item.name}</Text>
            <Text style={{ opacity: 0.85 }}>{item.phone}</Text>
            <Pressable
              onPress={() =>
                Alert.alert("Delete contact?", `${item.name}`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => removeContact(item.id) },
                ])
              }
              style={{ padding: 10, borderRadius: 12, alignItems: "center", backgroundColor: "#333" }}
            >
              <Text style={{ color: "white" }}>Delete</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
