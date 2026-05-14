import React from "react";
import { ScrollView, Text, View } from "react-native";

type LegalSection = {
  title: string;
  body: string;
};

type LegalDocumentScreenProps = {
  title: string;
  intro: string;
  sections: readonly LegalSection[];
  footer?: string;
};

export function LegalDocumentScreen({
  title,
  intro,
  sections,
  footer,
}: LegalDocumentScreenProps) {
  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        gap: 16,
        backgroundColor: "#f8fafc",
      }}
    >
      <View
        style={{
          gap: 10,
          padding: 18,
          borderRadius: 20,
          backgroundColor: "#fffdfb",
          borderWidth: 1,
          borderColor: "#d7dce2",
        }}
      >
        <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: "700" }}>
          {title}
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 24, opacity: 0.84 }}>{intro}</Text>
      </View>

      {sections.map((section) => (
        <View
          key={section.title}
          style={{
            gap: 8,
            padding: 18,
            borderRadius: 18,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: "#d7dce2",
          }}
        >
          <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "700" }}>
            {section.title}
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 23, opacity: 0.9 }}>
            {section.body}
          </Text>
        </View>
      ))}

      {footer ? (
        <View
          style={{
            padding: 18,
            borderRadius: 18,
            backgroundColor: "#111827",
          }}
        >
          <Text style={{ color: "white", fontSize: 15, lineHeight: 23, opacity: 0.9 }}>
            {footer}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
