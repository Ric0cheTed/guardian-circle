import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

type LegalLinksProps = {
  align?: "left" | "center";
};

export function LegalLinks({ align = "center" }: LegalLinksProps) {
  const router = useRouter();
  const textAlign = align;
  const alignItems = align === "left" ? "flex-start" : "center";

  return (
    <View style={{ gap: 6, alignItems }}>
      <Text style={{ opacity: 0.72, textAlign }}>
        Read our terms and privacy information
      </Text>
      <View style={{ flexDirection: "row", gap: 16 }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open terms screen"
          onPress={() => router.push("/legal/terms" as never)}
        >
          <Text style={{ color: "#8b1e2d", fontWeight: "600" }}>Terms</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open privacy screen"
          onPress={() => router.push("/legal/privacy" as never)}
        >
          <Text style={{ color: "#8b1e2d", fontWeight: "600" }}>Privacy</Text>
        </Pressable>
      </View>
    </View>
  );
}
