import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

const ONBOARDING_KEY = "onboarding_completed";
const SUBSCRIPTION_KEY = "subscription_active";

type RouteState = "loading" | "tabs" | "screen21" | "screen1";

export default function OnboardingIndex() {
  const [route, setRoute] = useState<RouteState>("loading");

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync(SUBSCRIPTION_KEY),
      SecureStore.getItemAsync(ONBOARDING_KEY),
    ]).then(([sub, onb]) => {
      if (sub === "true") {
        setRoute("tabs");
      } else if (onb === "true") {
        setRoute("screen21");
      } else {
        setRoute("screen1");
      }
    });
  }, []);

  if (route === "loading") return null;
  if (route === "tabs") return <Redirect href="/(tabs)" />;
  if (route === "screen21") return <Redirect href="/(onboarding)/screen21" />;
  return <Redirect href="/(onboarding)/screen1" />;
}
