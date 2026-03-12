import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { loadLaunchState } from "./lib/session";

export default function Index() {
  const [ready, setReady] = useState(false);
  const [destination, setDestination] = useState<
    "./login" | "./onboarding" | "./(tabs)"
  >("./login");

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { token, hasAcknowledgedSafetyNotice } = await loadLaunchState();

        if (!mounted) {
          return;
        }

        if (!token) {
          setDestination("./login");
        } else if (!hasAcknowledgedSafetyNotice) {
          setDestination("./onboarding");
        } else {
          setDestination("./(tabs)");
        }
      } finally {
        if (mounted) {
          setReady(true);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={destination} />;
}
