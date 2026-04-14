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
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

type Segment = { text: string; bold?: boolean };
type Slide = { id: string; image: number; segments: Segment[] };
type CharToken = { ch: string; bold: boolean };
type WordToken = { chars: CharToken[]; startIdx: number };

const TYPEWRITER_MS = 28;
const LETTER_FADE_MS = 480;

function slideToCharTokens(slide: Slide): CharToken[] {
  const out: CharToken[] = [];
  for (const seg of slide.segments) {
    const bold = !!seg.bold;
    for (const ch of seg.text) {
      out.push({ ch, bold });
    }
  }
  return out;
}

function charsToWordTokens(chars: CharToken[]): WordToken[] {
  const words: WordToken[] = [];
  let i = 0;
  while (i < chars.length) {
    const startIdx = i;
    const wordChars: CharToken[] = [];
    while (i < chars.length && chars[i].ch !== " ") {
      wordChars.push(chars[i++]);
    }
    while (i < chars.length && chars[i].ch === " ") {
      wordChars.push(chars[i++]);
    }
    if (wordChars.length > 0) words.push({ chars: wordChars, startIdx });
  }
  return words;
}

function renderCharRuns(tokens: CharToken[], visibleCount: number): React.ReactNode[] {
  const slice = tokens.slice(0, visibleCount);
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let runKey = 0;
  while (i < slice.length) {
    const bold = slice[i].bold;
    let run = "";
    while (i < slice.length && slice[i].bold === bold) {
      run += slice[i].ch;
      i++;
    }
    nodes.push(
      bold ? (
        <Text key={runKey++} style={styles.boldText}>
          {run}
        </Text>
      ) : (
        <Text key={runKey++}>{run}</Text>
      )
    );
  }
  return nodes;
}

const enterAnim = FadeIn.duration(LETTER_FADE_MS).easing(
  REasing.out(REasing.cubic)
);

function FadeLetter({ ch, bold }: { ch: string; bold: boolean }) {
  return (
    <RAnimated.View entering={enterAnim}>
      <Text style={bold ? [styles.charText, styles.boldText] : styles.charText}>
        {ch}
      </Text>
    </RAnimated.View>
  );
}

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
      { text: "once you've rewired your subconcious beliefs, watch as your dream life " },
      { text: "unfold.", bold: true },
    ],
  },
];

function TextSlide({
  slide,
  isActive,
  imageDelay,
  onComplete,
}: {
  slide: Slide;
  isActive: boolean;
  imageDelay: number;
  onComplete?: () => void;
}) {
  const tokens = useRef(slideToCharTokens(slide)).current;
  const words = useRef(charsToWordTokens(tokens)).current;
  const [visibleCount, setVisibleCount] = useState(() =>
    isActive ? 0 : tokens.length
  );

  useEffect(() => {
    if (!isActive) {
      setVisibleCount(tokens.length);
      return;
    }

    setVisibleCount(0);
    let intervalId: ReturnType<typeof setInterval>;
    const timeoutId = setTimeout(() => {
      let i = 0;
      intervalId = setInterval(() => {
        i += 1;
        if (i > tokens.length) {
          clearInterval(intervalId);
          onComplete?.();
          return;
        }
        const ch = tokens[i - 1]?.ch;
        if (ch && !/\s/.test(ch)) {
          Haptics.selectionAsync();
        }
        setVisibleCount(i);
      }, TYPEWRITER_MS);
    }, imageDelay);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [isActive, tokens, imageDelay]);

  return (
    <View style={styles.textSlide}>
      {isActive ? (
        <View style={styles.charRow}>
          {words.map((word, wIdx) => {
            const charsVisible = Math.max(
              0,
              Math.min(word.chars.length, visibleCount - word.startIdx)
            );
            if (charsVisible === 0) return null;
            return (
              <View key={wIdx} style={styles.wordRow}>
                {word.chars.slice(0, charsVisible).map((t, cIdx) => (
                  <FadeLetter key={cIdx} ch={t.ch} bold={t.bold} />
                ))}
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.slideText}>
          {renderCharRuns(tokens, tokens.length)}
        </Text>
      )}
    </View>
  );
}

export default function Screen2() {
  usePostHogScreenViewed({
    screen: "onboarding/screen2",
    component: "Screen2",
    screen_number: 2,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [activeIndex, setActiveIndex] = useState(0);
  const [typingDone, setTypingDone] = useState(false);
  const listRef = useRef<FlatList>(null);

  const dotAnims = useRef(
    slides.map((_, i) => new Animated.Value(i === 0 ? 1 : 0.3))
  ).current;

  const imgOpacities = useRef(slides.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    fadeIn();
    Animated.timing(imgOpacities[0], {
      toValue: 1,
      duration: 900,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    setTypingDone(false);
  }, [activeIndex]);

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
          duration: 700,
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
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
            <TextSlide
              slide={item}
              isActive={index === activeIndex}
              imageDelay={index === 0 ? 620 : 420}
              onComplete={index === activeIndex ? () => setTypingDone(true) : undefined}
            />
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
                style={[
                  styles.image,
                  slide.id === "1" && { width: "85%", height: "85%", alignSelf: "center" },
                  slide.id === "2" && { width: "70%", height: "70%", alignSelf: "center" },
                ]}
                resizeMode="contain"
              />
            </Animated.View>
          ))}
        </View>

        {/* Arrow */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.arrowButton, !typingDone && styles.arrowButtonDisabled]}
            onPress={typingDone ? handleArrow : undefined}
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
  charRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: isSmallDevice ? 20 : 20,
  },
  wordRow: {
    flexDirection: "row",
  },
  charText: {
    fontSize: isSmallDevice ? 28 : 32,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 34 : 40,
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
    paddingBottom: isSmallDevice ? 10 : 10,
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
  arrowButtonDisabled: {
    opacity: 0.3,
  },
  arrowText: {
    fontSize: 18,
    color: "#000",
  },
});
