import { useRef, useCallback } from "react";
import { Animated } from "react-native";
import { useRouter } from "expo-router";

export function useOnboardingNav() {
  const router = useRouter();
  const contentOpacity = useRef(new Animated.Value(0)).current;

  const fadeIn = useCallback(() => {
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [contentOpacity]);

  const navigateTo = useCallback(
    (href: string) => {
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        router.push(href as any);
      });
    },
    [contentOpacity, router]
  );

  const replaceTo = useCallback(
    (href: string) => {
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        router.replace(href as any);
      });
    },
    [contentOpacity, router]
  );

  return { contentOpacity, fadeIn, navigateTo, replaceTo };
}
