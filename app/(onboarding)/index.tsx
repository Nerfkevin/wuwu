import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import Superwall from "@superwall/react-native-superwall";

const ONBOARDING_KEY = "onboarding_completed";
const SUBSCRIPTION_KEY = "subscription_active";

type RouteState = "loading" | "tabs" | "screen21" | "screen1";

export default function OnboardingIndex() {
  const [route, setRoute] = useState<RouteState>("loading");

  useEffect(() => {
    async function checkAndRoute() {
      const [sub, onb] = await Promise.all([
        SecureStore.getItemAsync(SUBSCRIPTION_KEY),
        SecureStore.getItemAsync(ONBOARDING_KEY),
      ]);

      // Fast path: cached flag is still valid
      if (sub === "true") {
        setRoute("tabs");
        return;
      }

      // Live check via Superwall — handles new device, reinstall, external purchase
      // getSubscriptionStatus() awaits Superwall config internally so timing is safe
      try {
        const status = await Superwall.shared.getSubscriptionStatus();
        if (status.status === "ACTIVE") {
          await SecureStore.setItemAsync(SUBSCRIPTION_KEY, "true");
          setRoute("tabs");
          return;
        }
      } catch {
        // Superwall unavailable — fall through to cached onboarding state
      }

      if (onb === "true") {
        setRoute("screen21");
      } else {
        setRoute("screen1");
      }
    }

    void checkAndRoute();
  }, []);

  if (route === "loading") return null;
  if (route === "tabs") return <Redirect href="/(tabs)" />;
  if (route === "screen21") return <Redirect href="/(onboarding)/screen21" />;
  return <Redirect href="/(onboarding)/screen1" />;
}
