import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  Modal,
  Pressable,
} from "react-native";
import { MeshGradientView } from "expo-mesh-gradient";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

// ─── purple mesh (matches earlier onboarding screens) ─────────────────────────

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

const STEPS = [
  "curate your track",
  "record your affirmation",
  "layer healing frequency",
  "listen",
];

export default function Screen11() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [modalVisible, setModalVisible] = useState(false);

  const fadeTitle = useRef(new Animated.Value(0)).current;
  const fadeCard = useRef(new Animated.Value(0)).current;
  const fadePill = useRef(new Animated.Value(0)).current;
  const fadeBtn = useRef(new Animated.Value(0)).current;

  // modal animations
  const modalBg = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.88)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn();
    Animated.sequence([
      Animated.timing(fadeTitle, {
        toValue: 1,
        duration: 550,
        useNativeDriver: true,
      }),
      Animated.timing(fadeCard, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(fadePill, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(fadeBtn, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const openModal = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setModalVisible(true);
    Animated.parallel([
      Animated.timing(modalBg, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(modalScale, {
        toValue: 1,
        damping: 18,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(modalBg, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(modalOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setModalVisible(false));
  };

  const handleGetStarted = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.parallel([
      Animated.timing(modalBg, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalVisible(false);
      navigateTo("/(onboarding)/screen12");
    });
  };

  return (
    <>
    <TouchableWithoutFeedback onPress={openModal}>
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <MeshGradientView
        style={StyleSheet.absoluteFillObject}
        colors={BG_COLORS}
        points={BG_POINTS}
      />

      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* Title */}
          <Animated.Text style={[styles.title, { opacity: fadeTitle }]}>
            affirmations are powerful
          </Animated.Text>

          {/* Graph */}
          <Animated.Image
            source={require("@/assets/images/onboarding/graph.png")}
            style={[styles.graph, { opacity: fadeCard }]}
            resizeMode="contain"
          />

          {/* Pill text */}
          <Animated.View style={[styles.pill, { opacity: fadePill }]}>
            <Text style={styles.pillText}>
              keep listening to affirmations, you will manifest the life your
              identity affirms.
            </Text>
          </Animated.View>
        </View>

        {/* Footer CTA */}
        <Animated.View style={[styles.footer, { opacity: fadeBtn }]}>
          <TouchableOpacity
            onPress={openModal}
            activeOpacity={0.8}
            style={styles.ctaRow}
          >
            <Text style={styles.ctaText}>see how Wu-Wu works →</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

      {/* How it works modal - rendered outside TouchableWithoutFeedback */}
    </Animated.View>
    </TouchableWithoutFeedback>
      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        statusBarTranslucent
      >
        <Animated.View
          style={[
            styles.overlay,
            { opacity: modalBg.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeModal} />
        </Animated.View>

        <View style={styles.modalWrapper} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.modalCard,
              { opacity: modalOpacity, transform: [{ scale: modalScale }] },
            ]}
          >
            {/* App icon */}
            <Image
              source={require("@/assets/images/icon.png")}
              style={styles.icon}
              resizeMode="cover"
            />

            <Text style={styles.modalTitle}>here's how Wu-Wu works:</Text>

            {/* Steps */}
            <View style={styles.steps}>
              {STEPS.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <LinearGradient
                    colors={["#9B6DFF", "#5B1FE7"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.stepBadge}
                  >
                    <Text style={styles.stepNum}>{i + 1}</Text>
                  </LinearGradient>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            {/* Get Started */}
            <TouchableOpacity onPress={handleGetStarted} activeOpacity={0.85} style={{ width: "100%" }}>
              <LinearGradient
                colors={["#9B6DFF", "#5B1FE7"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.getStartedBtn}
              >
                <Text style={styles.getStartedText}>Get Started</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const CARD_WIDTH = width - 56;

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: isSmallDevice ? 20 : 36,
    gap: isSmallDevice ? 16 : 22,
    alignItems: "center",
  },
  title: {
    fontSize: isSmallDevice ? 30 : 38,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 36 : 44,
  },
  graph: {
    width: width,
    height: width * 1,
    alignSelf: "center",
  },
  pill: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 18,
    paddingHorizontal: 20,
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
    paddingBottom: 10,
    alignItems: "flex-end",
  },
  ctaRow: {
    paddingVertical: 10,
  },
  ctaText: {
    fontSize: isSmallDevice ? 15 : 17,
    color: "#fff",
    fontFamily: Fonts.mono,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // ─── modal ───────────────────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  modalWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 20,
  },
  icon: {
    width: 80,
    height: 80,
    borderRadius: 22,
    marginBottom: 20,
    overflow: "hidden",
  },
  modalTitle: {
    fontSize: isSmallDevice ? 16 : 24,
    color: "#111",
    fontFamily: Fonts.serif,
    fontWeight: "700",
    marginBottom: 22,
    textAlign: "center",
  },
  steps: {
    width: "100%",
    gap: 14,
    marginBottom: 28,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  stepBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: {
    color: "#fff",
    fontSize: 15,
    fontFamily: Fonts.mono,
    fontWeight: "700",
  },
  stepText: {
    fontSize: isSmallDevice ? 15 : 17,
    color: "#111",
    fontFamily: Fonts.mono,
  },
  getStartedBtn: {
    width: "100%",
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
  },
  getStartedText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: Fonts.mono,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});
