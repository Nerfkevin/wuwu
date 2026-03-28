import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Image, Dimensions, Animated, Platform, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { scheduleAffirmationReminder } from "@/lib/affirmation-reminder";
import { Fonts } from "@/constants/theme";

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
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [buttonEnabled, setButtonEnabled] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const fingerAnim = useRef(new Animated.Value(0)).current;
  const buttonFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

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
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });

        await AsyncStorage.setItem(
          "notificationsEnabled",
          status === "granted" ? "true" : "false"
        );

        if (status === "granted") {
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

    return () => clearTimeout(permissionTimeout);
  }, []);

  const handleContinue = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.push("/(onboarding)/screen18" as any);
    } catch (error) {
      console.error("[Screen17] Error in handleContinue:", error);
      router.push("/(onboarding)/screen18" as any);
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
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <Animated.View
          style={[styles.content, isSmallScreen && styles.contentSmall, { opacity: fadeAnim }]}
        >
          <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>
            Reminder to start your{"\n"}affirmation session
          </Text>

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
        </Animated.View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity
            onPress={buttonEnabled ? handleContinue : undefined}
            activeOpacity={buttonEnabled ? 0.75 : 1}
            disabled={!buttonEnabled}
          >
            <Animated.View style={[styles.continueButton, { backgroundColor: buttonBackgroundColor }]}>
              <Animated.Text style={[styles.continueButtonText, { color: buttonTextColor }]}>
                continue
              </Animated.Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
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
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 140,
    textAlign: "center",
    lineHeight: 36,
    fontFamily: Fonts.mono,
  },
  titleSmall: {
    marginBottom: 80,
    fontSize: 24,
    lineHeight: 32,
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
    paddingTop: 12,
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
