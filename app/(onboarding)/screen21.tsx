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
import * as SecureStore from "expo-secure-store";
import Superwall, {
  PaywallPresentationHandler,
  PaywallSkippedReasonUserIsSubscribed,
} from "@superwall/react-native-superwall";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHog, usePostHogScreenViewed } from "@/lib/posthog";

const ONBOARDING_KEY = "onboarding_completed";
const SUBSCRIPTION_KEY = "subscription_active";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

const FADE_HEIGHT = 56;

const TESTIMONIALS = [
  {
    title: "FINALLY!!",
    quote:
      "\u201cAfter two weeks of using my own voice for self-worth affirmations, I stopped second guessing every decision. It\u2019s like my inner critic finally got quiet, I feel lighter than I have in years.\u201d",
  },
  {
    title: "my own voice hits different",
    quote: "\u201cHearing my own voice say it finally stuck. Simple as that.\u201d",
  },
  {
    title: "the only thing that helped me manifest wealth",
    quote:
      "\u201cI was skeptical, but layering my abundance messages under 528 Hz while I work changed everything. Money started showing up in unexpected ways and I\u2019m no longer stressed about bills.\u201d",
  },
  {
    title: "game changer",
    quote: "\u201cFive minutes a day. Way less spiraling. I\u2019m in.\u201d",
  },
  {
    title: "stopped feeling so alone",
    quote:
      "\u201cNGL recording love affirmations in my voice felt weird at first, but now I catch myself smiling more around people. The loneliness is fading and I actually believe I\u2019m worthy of real connection.\u201d",
  },
  {
    title: "instant calm??",
    quote: "\u201cWeirdly calming. Like a reset button for my brain.\u201d",
  },
  {
    title: "closed more deals idk",
    quote:
      "\u201cI play my confidence affirmations every morning before client calls. My close rate went up, my anxiety went down. Hearing my own voice say \u2018you\u2019re enough\u2019 actually lands differently than reading it.\u201d",
  },
  {
    title: "first app I didn\u2019t delete",
    quote: "\u201cOnly thing I\u2019ve kept up longer than a week this year.\u201d",
  },
  {
    title: "kinder in the mirror fr",
    quote:
      "\u201cStruggled with body image for years. Three weeks in and I genuinely catch myself being kinder in the mirror. It\u2019s not magic\u2014it\u2019s just me, finally believing the things I\u2019ve always wanted to believe.\u201d",
  },
  {
    title: "okay it\u2019s not corny",
    quote: "\u201cSounds corny until you try it. Then it hits.\u201d",
  },
  {
    title: "nothing else ever stuck",
    quote:
      "\u201cI\u2019ve tried journaling, therapy apps, meditation. Nothing stuck like this. There\u2019s something about your own voice that bypasses all the resistance. Wu-Wu is the only habit I\u2019ve kept for more than a month.\u201d",
  },
  {
    title: "morning routine = unlocked",
    quote: "\u201cMorning routine upgrade. That\u2019s the whole review.\u201d",
  },
];

export default function Screen21() {
  usePostHogScreenViewed({
    screen: "onboarding/screen21",
    component: "Screen21",
    screen_number: 21,
  });
  const { contentOpacity, fadeIn } = useOnboardingNav();
  const router = useRouter();
  const headerAnim = useRef(new Animated.Value(0)).current;
  const listAnim = useRef(new Animated.Value(0)).current;
  const [isHandled, setIsHandled] = useState(false);
  const ph = usePostHog();

  useEffect(() => {
    // Mark onboarding as seen — app will return here on next launch until subscribed
    void SecureStore.setItemAsync(ONBOARDING_KEY, "true");

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

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      ph?.capture("paywall_register_started", {
        placement: "campaign_trigger",
        component: "Screen21",
      });
      void ph?.flush();
    } catch {}

    const handler = new PaywallPresentationHandler();

    handler.onPresent(() => {
      try {
        ph?.capture("paywall_presented", {
          placement: "campaign_trigger",
          screen: "paywall/campaign_trigger",
          component: "Screen21",
        });
        void ph?.flush();
      } catch {}
    });

    handler.onDismiss((_info, result) => {
      try {
        ph?.capture("paywall_dismissed", {
          placement: "campaign_trigger",
          result: result.type,
          component: "Screen21",
        });
        void ph?.flush();
      } catch {}
      if (result.type === "purchased" || result.type === "restored") {
        void SecureStore.setItemAsync(SUBSCRIPTION_KEY, "true");
        router.replace("/(tabs)" as any);
      } else {
        // declined or transaction abandoned — hard paywall: let them retry
        setIsHandled(false);
      }
    });

    handler.onSkip((reason) => {
      try {
        ph?.capture("paywall_skipped", {
          placement: "campaign_trigger",
          reason: reason.constructor?.name ?? "unknown",
          component: "Screen21",
        });
        void ph?.flush();
      } catch {}
      if (reason instanceof PaywallSkippedReasonUserIsSubscribed) {
        // Already subscribed — go straight to tabs
        void SecureStore.setItemAsync(SUBSCRIPTION_KEY, "true");
        router.replace("/(tabs)" as any);
      } else {
        // Holdout / no audience / placement not found — reset for retry
        setIsHandled(false);
      }
    });

    handler.onError((error) => {
      try {
        ph?.capture("paywall_error", {
          placement: "campaign_trigger",
          error: String(error),
          component: "Screen21",
        });
        void ph?.flush();
      } catch {}
      setIsHandled(false);
    });

    try {
      await Superwall.shared.register({ placement: "campaign_trigger", handler });
    } catch (e) {
      console.log("[Screen21] Paywall register error:", e);
      setIsHandled(false);
    }
  };

  const handleRestartOnboarding = async () => {
    await SecureStore.deleteItemAsync(ONBOARDING_KEY);
    router.replace("/(onboarding)/screen1" as any);
  };

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* ── Fixed header ── */}
        <Animated.View style={[styles.header, { opacity: headerAnim }]}>
          <TouchableOpacity
            onPress={handleRestartOnboarding}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Restart onboarding"
          >
            <Text style={styles.title}>
              Wu-Wu was designed for{"\n"}dreamers like you ❤️
            </Text>
          </TouchableOpacity>
          <Text style={styles.subtitle}>reviews from people using Wu-Wu.</Text>

          {/* Wreath */}
          <View style={styles.wreathSection}>
            <Image
              source={require("@/assets/images/onboarding/wreath.png")}
              style={styles.wreathImage}
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
                  <Text style={styles.cardTitle}>{t.title}</Text>
                  <Image
                    source={require("@/assets/images/onboarding/fivestar.png")}
                    style={styles.cardStars}
                    resizeMode="contain"
                  />
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
    marginBottom: -30,
  },

  wreathSection: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: -50,
    backgroundColor: "transparent",
  },
  wreathImage: {
    width: isSmallDevice ? 200 : 340,
    height: isSmallDevice ? 80 : 190,
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
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: {
    flex: 1,
    marginRight: 12,
    fontSize: isSmallDevice ? 16 : 18,
    color: "#fff",
    fontFamily: Fonts.serif,
    fontWeight: "700",
    lineHeight: isSmallDevice ? 22 : 24,
  },
  cardStars: {
    width: 110,
    height: 22,
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
