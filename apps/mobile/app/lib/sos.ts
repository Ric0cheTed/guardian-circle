import * as Linking from "expo-linking";

export function dialEmergencyUK() {
  // MVP: opens phone dialer. No automatic calling without user interaction on most devices.
  Linking.openURL("tel:999");
}
