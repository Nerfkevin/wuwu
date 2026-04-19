import React, { useEffect, useState, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Image, Dimensions, Animated, Platform } from "react-native";
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { scheduleAffirmationReminder } from "@/lib/affirmation-reminder";
import { Fonts } from "@/constants/theme";
import { ScalePressable } from "@/components/ScalePressable";

const TYPEWRITER_MS = 33;
const LETTER_FADE_MS = 480;
const SLIDE_DELAY_MS = 300;

type CharToken = { ch: string };
type WordToken = { chars: CharToken[]; startIdx: number };

function stringToCharTokens(s: string): CharToken[] {
  return [...s].map((ch) => ({ ch }));
}

function charsToWordTokens(chars: CharToken[]): WordToken[] {
  const words: WordToken[] = [];
  let i = 0;
  while (i < chars.length) {
    const startIdx = i;
    if (chars[i].ch === "\n") {
      words.push({ chars: [{ ch: "\n" }], startIdx });
      i += 1;
      continue;
    }
    const wordChars: CharToken[] = [];
    while (i < chars.length && chars[i].ch !== " " && chars[i].ch !== "\n") {
      wordChars.push(chars[i++]);
    }
    while (i < chars.length && chars[i].ch === " ") {
      wordChars.push(chars[i++]);
    }
    if (wordChars.length > 0) words.push({ chars: wordChars, startIdx });
  }
  return words;
}

const letterEnter = FadeIn.duration(LETTER_FADE_MS).easing(REasing.out(REasing.cubic));

function FadeLetter({ ch, charStyle }: { ch: string; charStyle: object }) {
  return (
    <RAnimated.View entering={letterEnter}>
      <Text style={charStyle}>{ch}</Text>
    </RAnimated.View>
  );
}

const { width, height } = Dimensions.get("window");
const isSmallDevice = width < 380;
const isSmallScreen = height < 700;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function Screen17() {
  usePostHogScreenViewed({
    screen: "onboarding/screen17",
    component: "Screen17",
    screen_number: 17,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const insets = useSafeAreaInsets();

  const TITLE_TEXT = "Reminder to start your\naffirmation session";
  const titleTokens = useMemo(() => stringToCharTokens(TITLE_TEXT), []);
  const titleWords = useMemo(() => charsToWordTokens(titleTokens), [titleTokens]);
  const [visibleCount, setVisibleCount] = useState(0);

  const [buttonEnabled, setButtonEnabled] = useState(false);
  const fingerAnim = useRef(new Animated.Value(0)).current;
  const buttonFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn();

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const delayId = setTimeout(() => {
      let i = 0;
      intervalId = setInterval(() => {
        i += 1;
        if (i > titleTokens.length) {
          clearInterval(intervalId!);
          return;
        }
        const ch = titleTokens[i - 1]?.ch;
        if (ch && ch !== " " && ch !== "\n") {
          Haptics.selectionAsync();
        }
        setVisibleCount(i);
      }, TYPEWRITER_MS);
    }, SLIDE_DELAY_MS);

    Animated.loop(
      Animated.sequence([
        Animated.timing(fingerAnim, {
          toValue: -20,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(fingerAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();

    const requestPermissions = async () => {
      try {
        const result = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        const isGranted =
          result.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
          result.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

        await AsyncStorage.setItem(
          "notificationsEnabled",
          isGranted ? "true" : "false"
        );

        if (isGranted) {
          await scheduleAffirmationReminder();
        }

        setTimeout(() => {
          setButtonEnabled(true);
          Animated.timing(buttonFadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }).start();
        }, 500);
      } catch (error) {
        console.error("[Screen17] Error requesting notifications:", error);
        setTimeout(() => {
          setButtonEnabled(true);
          Animated.timing(buttonFadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }).start();
        }, 500);
      }
    };

    const permissionTimeout = setTimeout(() => {
      requestPermissions();
    }, 1500);

    return () => {
      clearTimeout(delayId);
      if (intervalId) clearInterval(intervalId);
      clearTimeout(permissionTimeout);
    };
  }, []);

  const handleContinue = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      navigateTo("/(onboarding)/screen18");
    } catch (error) {
      console.error("[Screen17] Error in handleContinue:", error);
      navigateTo("/(onboarding)/screen18");
    }
  };

  const buttonBackgroundColor = buttonFadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.18)", "rgba(255,255,255,1)"],
  });

  const buttonTextColor = buttonFadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.35)", "rgba(0,0,0,1)"],
  });

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={[styles.content, isSmallScreen && styles.contentSmall]}>
          <View style={[styles.titleSlot, isSmallScreen && styles.titleSlotSmall]}>
            <View style={styles.charRow}>
              {titleWords.map((word, wIdx) => {
                const charsVisible = Math.max(
                  0,
                  Math.min(word.chars.length, visibleCount - word.startIdx)
                );
                if (charsVisible === 0) return null;
                if (word.chars.length === 1 && word.chars[0].ch === "\n") {
                  return <View key={wIdx} style={styles.lineBreak} />;
                }
                return (
                  <View key={wIdx} style={styles.wordRow}>
                    {word.chars.slice(0, charsVisible).map((t, cIdx) => (
                      <FadeLetter
                        key={`${word.startIdx}-${cIdx}`}
                        ch={t.ch}
                        charStyle={[styles.titleChar, isSmallScreen && styles.titleCharSmall]}
                      />
                    ))}
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.notificationContainer}>
            <Image
              source={require("@/assets/images/onboarding/notifications.png")}
              style={[styles.notificationImage, isSmallScreen && styles.notificationImageSmall]}
              resizeMode="contain"
            />

            <Animated.Image
              source={require("@/assets/images/onboarding/fingerPointUp.png")}
              style={[
                styles.fingerImage,
                isSmallScreen && styles.fingerImageSmall,
                { transform: [{ translateY: fingerAnim }] },
              ]}
              resizeMode="contain"
            />
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
          <ScalePressable
            onPress={buttonEnabled ? handleContinue : undefined}
            disabled={!buttonEnabled}
            scaleTo={0.96}
          >
            <Animated.View style={[styles.continueButton, { backgroundColor: buttonBackgroundColor }]}>
              <Animated.Text style={[styles.continueButtonText, { color: buttonTextColor }]}>
                continue
              </Animated.Text>
            </Animated.View>
          </ScalePressable>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  contentSmall: {
    paddingTop: 40,
  },
  titleSlot: {
    width: "100%",
    height: 88,
    marginBottom: 140,
  },
  titleSlotSmall: {
    height: 72,
    marginBottom: 80,
  },
  charRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    width: "100%",
  },
  wordRow: {
    flexDirection: "row",
  },
  lineBreak: {
    width: "100%",
    height: 0,
  },
  titleChar: {
    fontSize: isSmallDevice ? 26 : 32,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 34 : 42,
  },
  titleCharSmall: {
    fontSize: 26,
    lineHeight: 36,
  },
  notificationContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notificationImage: {
    width: width * 0.9,
    height: 200,
  },
  notificationImageSmall: {
    height: 160,
  },
  fingerImage: {
    width: 60,
    height: 60,
    position: "absolute",
    bottom: -60,
    right: width * 0.15,
  },
  fingerImageSmall: {
    width: 50,
    height: 50,
    bottom: -50,
  },
  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 10 : 10,
    paddingTop: 10,
  },
  continueButton: {
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
  },
  continueButtonText: {
    fontSize: isSmallDevice ? 15 : 17,
    letterSpacing: 0.3,
    fontFamily: Fonts.mono,
  },
});
