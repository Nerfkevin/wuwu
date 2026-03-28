import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MeshGradientView } from "expo-mesh-gradient";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import Svg, { Path as SvgPath } from "react-native-svg";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

const COMMITMENTS = [
  "listen to my own voice",
  "protect my mind from negativity",
  "nurture my inner peace",
  "manifest my abundant self daily",
];

const PAD_HEIGHT = isSmallDevice ? 150 : 190;

export default function Screen20() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [userName, setUserName] = useState<string | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [hasSignature, setHasSignature] = useState(false);
  const currentPath = useRef("");
  const fadeContinue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn();
    SecureStore.getItemAsync("user_name").then((val) => {
      if (val) setUserName(val);
    });
  }, []);

  useEffect(() => {
    Animated.timing(fadeContinue, {
      toValue: hasSignature ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [hasSignature]);

  const buttonBg = fadeContinue.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.18)", "rgba(255,255,255,1)"],
  });
  const buttonTextColor = fadeContinue.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.35)", "rgba(0,0,0,1)"],
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPath.current = `M ${locationX} ${locationY}`;
        setPaths((prev) => [...prev, currentPath.current]);
        setHasSignature(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPath.current += ` L ${locationX} ${locationY}`;
        setPaths((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = currentPath.current;
          return updated;
        });
      },
    })
  ).current;

  const handleClear = () => {
    setPaths([]);
    setHasSignature(false);
    currentPath.current = "";
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSign = async () => {
    if (!hasSignature) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigateTo("/(onboarding)/screen21");
  };

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <MeshGradientView
        style={StyleSheet.absoluteFill}
        columns={3}
        rows={3}
        colors={[
          "#7B2FBE", "#A030B0", "#9D2A6A",
          "#5A1A9E", "#7B2090", "#8B1A60",
          "#1A0535", "#3D0E7A", "#250845",
        ]}
        points={[
          [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
          [0.0, 0.5], [0.45, 0.42], [1.0, 0.5],
          [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
        ]}
        smoothsColors
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>sign your commitment</Text>

          {/* Commitment card */}
          <View style={styles.card}>
            <Text style={styles.commitIntro}>
              {userName ? `I, ${userName}, commit to:` : "I commit to:"}
            </Text>
            {COMMITMENTS.map((item) => (
              <View key={item} style={styles.listItem}>
                <Text style={styles.checkEmoji}>✅</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* Signature pad */}
          <View style={styles.signatureSection}>
            <View style={styles.signatureBox} {...panResponder.panHandlers}>
              {!hasSignature && (
                <View style={styles.placeholder} pointerEvents="none">
                  <Text style={styles.placeholderText}>Draw your signature on this box</Text>
                </View>
              )}
              <Svg height={PAD_HEIGHT} width="100%" style={StyleSheet.absoluteFill}>
                {paths.map((d, i) => (
                  <SvgPath
                    key={i}
                    d={d}
                    stroke="#1A0535"
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </Svg>
              {hasSignature && (
                <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
                  <Text style={styles.clearText}>clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.hint}>sign as a reminder of the promise you're making to yourself.</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={hasSignature ? handleSign : undefined}
            activeOpacity={hasSignature ? 0.75 : 1}
            disabled={!hasSignature}
          >
            <Animated.View style={[styles.signButton, { backgroundColor: buttonBg }]}>
              <Animated.Text style={[styles.signButtonText, { color: buttonTextColor }]}>
                sign
              </Animated.Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: isSmallDevice ? 20 : 24,
    paddingBottom: 100,
  },

  title: {
    fontSize: isSmallDevice ? 22 : 28,
    color: "#fff",
    fontFamily: Fonts.mono,
    textAlign: "center",
    marginTop: isSmallDevice ? 24 : 32,
    marginBottom: isSmallDevice ? 20 : 28,
    letterSpacing: 0.3,
  },

  card: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 20,
    padding: isSmallDevice ? 16 : 20,
    gap: isSmallDevice ? 10 : 14,
    marginBottom: isSmallDevice ? 20 : 24,
  },
  commitIntro: {
    fontSize: isSmallDevice ? 13 : 15,
    color: "rgba(255,255,255,0.7)",
    fontFamily: Fonts.mono,
    marginBottom: 4,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkEmoji: {
    fontSize: isSmallDevice ? 14 : 16,
    marginTop: 1,
  },
  listText: {
    fontSize: isSmallDevice ? 13 : 15,
    color: "#fff",
    fontFamily: Fonts.mono,
    flex: 1,
    lineHeight: isSmallDevice ? 20 : 23,
  },

  signatureSection: {
    gap: 10,
  },
  signatureBox: {
    height: PAD_HEIGHT,
    backgroundColor: "rgba(220,210,240,0.92)",
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  placeholderText: {
    fontSize: isSmallDevice ? 14 : 16,
    color: "#888",
    fontFamily: Fonts.mono,
  },
  clearBtn: {
    position: "absolute",
    bottom: 10,
    right: 14,
    zIndex: 5,
  },
  clearText: {
    fontSize: isSmallDevice ? 12 : 14,
    color: "#5A1A9E",
    fontFamily: Fonts.mono,
  },
  hint: {
    fontSize: isSmallDevice ? 11 : 12,
    color: "rgba(255,255,255,0.45)",
    fontFamily: Fonts.mono,
    lineHeight: 18,
  },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 10 : 20,
    paddingTop: 12,
  },
  signButton: {
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
  },
  signButtonText: {
    fontSize: isSmallDevice ? 15 : 17,
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
});
