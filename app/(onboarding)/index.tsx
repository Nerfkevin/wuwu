import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

const ONBOARDING_KEY = "onboarding_completed";

export default function OnboardingIndex() {
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(ONBOARDING_KEY)
      .then((val) => setIsCompleted(val === "true"))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return null;

  if (isCompleted) return <Redirect href="/(tabs)" />;

  return <Redirect href="/(onboarding)/screen1" />;
}
