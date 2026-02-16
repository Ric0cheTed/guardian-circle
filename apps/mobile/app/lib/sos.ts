import * as Linking from "expo-linking";

export async function dialEmergencyUK() {
  // MVP: opens phone dialer. No automatic calling without user interaction on most devices.
  const canOpen = await Linking.canOpenURL("tel:999");
  if (!canOpen) {
    throw new Error("This device cannot open the emergency dialer.");
  }

  await Linking.openURL("tel:999");
}
