import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  ScrollView,
  Image,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Superwall from "@superwall/react-native-superwall";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

const FADE_HEIGHT = 56;

const TESTIMONIALS = [
  {
    name: "Jacob Cullen",
    image: "https://i.pravatar.cc/150?u=Jacob",
    quote:
      "\u201cAfter two weeks of using my own voice for self-worth affirmations, I stopped second guessing every decision. It\u2019s like my inner critic finally got quiet, I feel lighter than I have in years.\u201d",
  },
  {
    name: "Kervin Ngo",
    image: "https://i.pravatar.cc/150?u=Kervin",
    quote:
      "\u201cI was skeptical, but layering my abundance messages under 528 Hz while I work changed everything. Money started showing up in unexpected ways and I\u2019m no longer stressed about bills.\u201d",
  },
  {
    name: "Renesmee Shin",
    image: "https://i.pravatar.cc/150?u=Renesmee",
    quote:
      "\u201cNGL recording love affirmations in my voice felt weird at first, but now I catch myself smiling more around people. The loneliness is fading and I actually believe I\u2019m worthy of real connection.\u201d",
  },
];

export default function Screen21() {
  const { contentOpacity, fadeIn } = useOnboardingNav();
  const router = useRouter();
  const headerAnim = useRef(new Animated.Value(0)).current;
  const listAnim = useRef(new Animated.Value(0)).current;
  const [isHandled, setIsHandled] = useState(false);

  useEffect(() => {
    fadeIn();
    Animated.stagger(200, [
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(listAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleJoin = async () => {
    if (isHandled) return;
    setIsHandled(true);

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Start paywall — resolves on subscribe, decline, or transaction_fail
    const paywallPromise = Superwall.shared.register({
      placement: "campaign_trigger",
    });

    // Navigate to main app 500ms after paywall starts presenting,
    // so tabs are ready whether user subscribes or dismisses
    setTimeout(() => {
      try {
        if (router.canDismiss()) router.dismissAll();
        router.replace("/(tabs)" as any);
      } catch (e) {
        console.error("[Screen21] Navigation error:", e);
        router.push("/(tabs)" as any);
      }
    }, 500);

    // Await completion (subscribe / paywall_decline / transaction_fail all resolve here)
    try {
      await paywallPromise;
    } catch (e) {
      console.log("[Screen21] Paywall register error:", e);
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* ── Fixed header ── */}
        <Animated.View style={[styles.header, { opacity: headerAnim }]}>
          <Text style={styles.title}>
            Wu-Wu was designed for{"\n"}people like you ❤️
          </Text>
          <Text style={styles.subtitle}>reviews from people using Wu-Wu.</Text>

          {/* Wreath + stars */}
          <View style={styles.wreathSection}>
            <Image
              source={require("@/assets/images/onboarding/wreath.png")}
              style={styles.wreathImage}
              resizeMode="contain"
            />
            <Image
              source={require("@/assets/images/onboarding/fivestar.png")}
              style={styles.starsImage}
              resizeMode="contain"
            />
          </View>
        </Animated.View>

        {/* ── Scrollable cards with fade edges ── */}
        <Animated.View style={[styles.listWrapper, { opacity: listAnim }]}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {TESTIMONIALS.map((t, i) => (
              <View key={i} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Image source={{ uri: t.image }} style={styles.avatar} />
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{t.name}</Text>
                    <Image
                      source={require("@/assets/images/onboarding/fivestar.png")}
                      style={styles.cardStars}
                      resizeMode="contain"
                    />
                  </View>
                </View>
                <Text style={styles.quote}>{t.quote}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Top fade */}
          <LinearGradient
            colors={["#0a000d", "transparent"]}
            style={styles.fadeTop}
            pointerEvents="none"
          />
          {/* Bottom fade */}
          <LinearGradient
            colors={["transparent", "#0a000d"]}
            style={styles.fadeBottom}
            pointerEvents="none"
          />
        </Animated.View>

        {/* ── Footer button ── */}
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleJoin}
            activeOpacity={0.75}
            style={styles.joinButton}
          >
            <Text style={styles.joinText}>join Wu-Wu 🙏</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },

  header: {
    paddingHorizontal: isSmallDevice ? 24 : 28,
    paddingTop: isSmallDevice ? 20 : 28,
    paddingBottom: 8,
  },
  title: {
    fontSize: isSmallDevice ? 26 : 32,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 36 : 44,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: isSmallDevice ? 12 : 14,
    color: "rgba(255,255,255,0.5)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.2,
    marginBottom: 16,
  },

  wreathSection: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  wreathImage: {
    width: isSmallDevice ? 200 : 240,
    height: isSmallDevice ? 80 : 96,
  },
  starsImage: {
    position: "absolute",
    width: isSmallDevice ? 120 : 140,
    height: isSmallDevice ? 28 : 32,
  },

  listWrapper: {
    flex: 1,
    overflow: "hidden",
  },
  scrollContent: {
    paddingHorizontal: isSmallDevice ? 20 : 24,
    paddingTop: FADE_HEIGHT,
    paddingBottom: FADE_HEIGHT,
    gap: 14,
  },

  fadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: FADE_HEIGHT,
  },
  fadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: FADE_HEIGHT,
  },

  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: isSmallDevice ? 16 : 20,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#333",
  },
  nameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontSize: isSmallDevice ? 15 : 17,
    color: "#fff",
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  cardStars: {
    width: 80,
    height: 16,
  },
  quote: {
    fontSize: isSmallDevice ? 13 : 14,
    color: "rgba(255,255,255,0.75)",
    fontFamily: Fonts.mono,
    lineHeight: isSmallDevice ? 20 : 22,
    letterSpacing: 0.1,
  },

  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 12 : 20,
    paddingTop: 10,
  },
  joinButton: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
  },
  joinText: {
    fontSize: isSmallDevice ? 15 : 17,
    fontFamily: Fonts.mono,
    color: "#000",
    letterSpacing: 0.3,
  },
});
