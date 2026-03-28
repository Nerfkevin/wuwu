import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  Linking,
} from "react-native";
import { MeshGradientView } from "expo-mesh-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width, height } = Dimensions.get("window");
const isSmallDevice = width < 380;

const BG_COLORS = [
  "#100018", "#18002a", "#0e0014",
  "#0a0010", "#160022", "#0e0014",
  "#07000e", "#0e001a", "#0a0010",
];
const BG_POINTS: [number, number][] = [
  [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
  [0.0, 0.5], [0.48, 0.44], [1.0, 0.5],
  [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
];

const OVERLAY_COLORS = [
  "#7B2FBE", "#A030B0", "#9D2A6A",
  "#5A1A9E", "#7B2090", "#8B1A60",
  "#1A0535", "#3D0E7A", "#250845",
];

type PermState = "idle" | "granted" | "denied";

export default function Screen12() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [permState, setPermState] = useState<PermState>("idle");
  const [userName, setUserName] = useState("");
  const [showOverlay, setShowOverlay] = useState(false);

  const fadeTitle = useRef(new Animated.Value(0)).current;
  const fadeMic = useRef(new Animated.Value(0)).current;
  const fadePill = useRef(new Animated.Value(0)).current;
  const fadeBtn = useRef(new Animated.Value(0)).current;

  const pillOpacity = useRef(new Animated.Value(1)).current;

  // overlay animations
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const overlayTextOpacity = useRef(new Animated.Value(0)).current;
  const overlayTextY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    fadeIn();
    Animated.sequence([
      Animated.timing(fadeTitle, { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.timing(fadeMic, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(fadePill, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(fadeBtn, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    SecureStore.getItemAsync("user_name").then((val) => {
      if (val) setUserName(val);
    });
  }, []);

  const swapPill = (next: () => void) => {
    Animated.timing(pillOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      next();
      Animated.timing(pillOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  };

  const showCelebrationThenNavigate = () => {
    setShowOverlay(true);
    // fade overlay in
    Animated.timing(overlayOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start(() => {
      // text slides up & fades in
      Animated.parallel([
        Animated.timing(overlayTextOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(overlayTextY, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]).start(() => {
        // hold for ~1.8s then navigate while overlay is still visible
        setTimeout(() => {
          navigateTo("/(onboarding)/screen13");
        }, 1800);
      });
    });
  };

  const handleUnlock = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await requestRecordingPermissionsAsync();
    if (result.granted) {
      swapPill(() => setPermState("granted"));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(showCelebrationThenNavigate, 400);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      swapPill(() => setPermState("denied"));
    }
  };

  const handleOpenSettings = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openSettings();
  };

  const handleSkip = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigateTo("/(onboarding)/screen13");
  };

  const pillText =
    permState === "denied"
      ? "you can enable microphone access in settings anytime to unlock voice affirmations"
      : permState === "granted"
      ? "microphone unlocked — your voice is ready ✓"
      : "your voice is the most powerful sound that understands you";

  const greeting = userName
    ? `awesome ${userName},\nlet's build your\naffirmation track!`
    : `awesome,\nlet's build your\naffirmation track!`;

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <MeshGradientView
        style={StyleSheet.absoluteFillObject}
        colors={BG_COLORS}
        points={BG_POINTS}
      />

      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Animated.Text style={[styles.title, { opacity: fadeTitle }]}>
            {permState === "denied"
              ? "microphone access denied"
              : "allow microphone recording"}
          </Animated.Text>

          <Animated.View style={[styles.micWrap, { opacity: fadeMic }]}>
            <View style={[styles.micRing, permState === "granted" && styles.micRingGranted]}>
              <Text style={styles.micEmoji}>🎙️</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.pill, { opacity: Animated.multiply(fadePill, pillOpacity) }]}>
            <Text style={styles.pillText}>{pillText}</Text>
          </Animated.View>
        </View>

        <Animated.View style={[styles.footer, { opacity: fadeBtn }]}>
          {permState === "denied" ? (
            <View style={styles.deniedActions}>
              <TouchableOpacity onPress={handleOpenSettings} activeOpacity={0.85} style={styles.settingsBtn}>
                <Text style={styles.settingsBtnText}>open settings</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSkip} activeOpacity={0.7} style={styles.skipRow}>
                <Text style={styles.skipText}>continue without microphone →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleUnlock}
              activeOpacity={0.85}
              style={styles.ctaBtn}
              disabled={permState === "granted"}
            >
              <Text style={styles.ctaText}>
                {permState === "granted" ? "unlocked ✓" : "unlock your voice"}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </SafeAreaView>

      {/* ── Celebration overlay ── */}
      {showOverlay && (
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents="none">
          <MeshGradientView
            style={StyleSheet.absoluteFillObject}
            columns={3}
            rows={3}
            colors={OVERLAY_COLORS}
            points={BG_POINTS}
            smoothsColors
          />
          <SafeAreaView style={styles.overlaySafe}>
            <Animated.Text
              style={[
                styles.overlayText,
                {
                  opacity: overlayTextOpacity,
                  transform: [{ translateY: overlayTextY }],
                },
              ]}
            >
              {greeting}
            </Animated.Text>
          </SafeAreaView>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: isSmallDevice ? 24 : 44,
    gap: isSmallDevice ? 20 : 28,
  },
  title: {
    fontSize: isSmallDevice ? 28 : 36,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 34 : 42,
  },
  micWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: isSmallDevice ? 40 : 60,
    marginBottom: isSmallDevice ? 32 : 48,
  },
  micRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(155, 109, 255, 0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(155, 109, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  micRingGranted: {
    backgroundColor: "rgba(100, 220, 130, 0.15)",
    borderColor: "rgba(100, 220, 130, 0.4)",
  },
  micEmoji: {
    fontSize: 80,
  },
  pill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 18,
    paddingHorizontal: 20,
    width: "100%",
  },
  pillText: {
    fontSize: isSmallDevice ? 14 : 15,
    color: "#fff",
    fontFamily: Fonts.mono,
    lineHeight: 24,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: isSmallDevice ? 10 : 10,
  },
  ctaBtn: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: isSmallDevice ? 15 : 18,
    alignItems: "center",
  },
  ctaText: {
    color: "#0a000d",
    fontSize: 17,
    fontFamily: Fonts.mono,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  deniedActions: {
    width: "100%",
    gap: 14,
    alignItems: "center",
  },
  settingsBtn: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: isSmallDevice ? 15 : 18,
    alignItems: "center",
    width: "100%",
  },
  settingsBtnText: {
    color: "#0a000d",
    fontSize: 17,
    fontFamily: Fonts.mono,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  skipRow: { paddingVertical: 8 },
  skipText: {
    fontSize: isSmallDevice ? 13 : 15,
    color: "rgba(255,255,255,0.55)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.2,
  },

  // ── overlay ──
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  overlaySafe: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  overlayText: {
    fontSize: isSmallDevice ? 32 : 40,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 42 : 52,
  },
});
