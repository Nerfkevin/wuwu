import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Image,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

type Segment = { text: string; bold?: boolean };
type Slide = { id: string; image: number; segments: Segment[] };

const slides: Slide[] = [
  {
    id: "1",
    image: require("@/assets/images/onboarding/fraghand.png"),
    segments: [
      { text: "your mind is looping old beliefs, pulling you away from the " },
      { text: "life you desire.", bold: true },
    ],
  },
  {
    id: "2",
    image: require("@/assets/images/onboarding/orb1.png"),
    segments: [
      { text: "Wu–Wu", bold: true },
      { text: " helps you manifest your dream life." },
    ],
  },
  {
    id: "3",
    image: require("@/assets/images/onboarding/fraghandorb.png"),
    segments: [
      { text: "it's " },
      { text: "simple.", bold: true },
      { text: " everyday, listen to affirmations in your own voice." },
    ],
  },
  {
    id: "4",
    image: require("@/assets/images/orb.png"),
    segments: [
      { text: "once you've rewired your beliefs, watch as your dream life " },
      { text: "unfold.", bold: true },
    ],
  },
];

function TextSlide({
  slide,
  isActive,
}: {
  slide: Slide;
  isActive: boolean;
}) {
  const fadeText = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    if (isActive) {
      fadeText.setValue(0);
      const anim = Animated.timing(fadeText, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      });
      anim.start();
      return () => anim.stop();
    }
  }, [isActive]);

  return (
    <View style={styles.textSlide}>
      <Animated.Text style={[styles.slideText, { opacity: fadeText }]}>
        {slide.segments.map((seg, i) =>
          seg.bold ? (
            <Text key={i} style={styles.boldText}>
              {seg.text}
            </Text>
          ) : (
            <Text key={i}>{seg.text}</Text>
          )
        )}
      </Animated.Text>
    </View>
  );
}

export default function Screen2() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const dotAnims = useRef(
    slides.map((_, i) => new Animated.Value(i === 0 ? 1 : 0.3))
  ).current;

  const imgOpacities = useRef(slides.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    fadeIn();
    Animated.timing(imgOpacities[0], {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    // Animate dots
    dotAnims.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: i === activeIndex ? 1 : 0.3,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });

    // Crossfade images
    Animated.parallel(
      imgOpacities.map((anim, i) =>
        Animated.timing(anim, {
          toValue: i === activeIndex ? 1 : 0,
          duration: 400,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [activeIndex]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / width);
      if (idx !== activeIndex) setActiveIndex(idx);
    },
    [activeIndex]
  );

  const handleArrow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (activeIndex < slides.length - 1) {
      const next = activeIndex + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    } else {
      navigateTo("/(onboarding)/screen3");
    }
  };

  const imgSize = isSmallDevice ? 150 : 150;

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Page indicator */}
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <Animated.View
              key={i}
              style={[styles.dot, { opacity: dotAnims[i] }]}
            />
          ))}
        </View>

        {/* Text-only carousel */}
        <FlatList
          ref={listRef}
          data={slides}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleScroll}
          renderItem={({ item, index }) => (
            <TextSlide slide={item} isActive={index === activeIndex} />
          )}
          style={styles.list}
        />

        {/* Static crossfading image */}
        <View style={[styles.imageArea, { height: imgSize }]}>
          {slides.map((slide, i) => (
            <Animated.View
              key={slide.id}
              style={[StyleSheet.absoluteFillObject, { opacity: imgOpacities[i] }]}
            >
              <Image
                source={slide.image}
                style={styles.image}
                resizeMode="contain"
              />
            </Animated.View>
          ))}
        </View>

        {/* Arrow */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.arrowButton}
            onPress={handleArrow}
            activeOpacity={0.75}
          >
            <Text style={styles.arrowText}>→</Text>
          </TouchableOpacity>
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
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    paddingTop: 16,
    paddingBottom: 20,
  },
  dot: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  list: {
    flexGrow: 0,
  },
  textSlide: {
    width,
    paddingHorizontal: isSmallDevice ? 28 : 36,
    justifyContent: "flex-start",
  },
  slideText: {
    fontSize: isSmallDevice ? 28 : 32,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 34 : 40,
    textAlign: "left",
    marginTop: isSmallDevice ? 20 : 20,
  },
  boldText: {
    fontFamily: Fonts.serifBold,
    color: "#fff",
  },
  imageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 20,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 20 : 32,
    alignItems: "flex-end",
  },
  arrowButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: {
    fontSize: 18,
    color: "#000",
  },
});
