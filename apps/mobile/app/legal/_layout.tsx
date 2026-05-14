import { Stack } from "expo-router";

export default function LegalLayout() {
  return (
    <Stack>
      <Stack.Screen name="terms" options={{ title: "Terms" }} />
      <Stack.Screen name="privacy" options={{ title: "Privacy" }} />
    </Stack>
  );
}
