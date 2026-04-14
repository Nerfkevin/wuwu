import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import * as WebBrowser from "expo-web-browser";
import { MeshGradientView } from "expo-mesh-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";

const TYPEWRITER_MS = 50;
const LETTER_FADE_MS = 480;

const letterEnter = FadeIn.duration(LETTER_FADE_MS).easing(REasing.out(REasing.cubic));

function FadeLetter({ ch, charStyle }: { ch: string; charStyle: object }) {
  return (
    <RAnimated.View entering={letterEnter}>
      <Text style={charStyle}>{ch}</Text>
    </RAnimated.View>
  );
}

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

// ─── mesh gradient — vivid reds so it's actually visible ─────────────────────

const BG_COLORS = [
  "#3d0000", "#7a0000", "#2a0000",
  "#5c0000", "#990000", "#3d0000",
  "#1a0000", "#520000", "#2a0000",
];
const BG_POINTS: [number, number][] = [
  [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
  [0.0, 0.5], [0.5, 0.42], [1.0, 0.5],
  [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
];

// ─── slide data ───────────────────────────────────────────────────────────────

const SLIDES = [
  {
    label: "reduces",
    word: "stress",
    image: require("@/assets/images/onboarding/butterfly.png"),
    quote:
      '"Self-affirmation can reduce both affective and neural responses to stress exposure, and mitigate some of the performance consequences of stress"',
    author: "(Dutcher et al., 2020)",
    journal: "Social Cognitive & Affective Neuroscience - Oxford",
    link: "https://academic.oup.com/scan/article/15/10/1086/5815969",
  },
  {
    label: "increases",
    word: "performance",
    image: require("@/assets/images/onboarding/lotus.png"),
    quote:
      '"Self-affirmation can improve outcomes, health, and sustained behavior change for individuals with low self-worth"',
    author: "(Cohen & Sherman, 2014)",
    journal: "Annual Review Psychology",
    link: "https://www.annualreviews.org/content/journals/10.1146/annurev-psych-010213-115137",
  },
  {
    label: "improves",
    word: "well-being",
    image: require("@/assets/images/onboarding/plant.png"),
    quote:
      '"Sound-based meditation (528 Hz solfeggios, singing bowls etc.) reduces tension, stress, blood pressure, creating a harmonious mindset."',
    author: "(Ravikumar & Sathyanarayanan, 2025)",
    journal: "Research Square",
    link: "https://www.researchsquare.com/article/rs-7554543/v2",
  },
];

// ─── text slide (inside FlatList) ─────────────────────────────────────────────

function TextSlide({
  item,
  isActive,
  onWordComplete,
}: {
  item: (typeof SLIDES)[0];
  isActive: boolean;
  onWordComplete: () => void;
}) {
  const fadeLabel = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const quoteOpacity = useRef(new Animated.Value(0)).current;
  const wordTokens = useMemo(() => [...item.word].map((ch) => ({ ch })), [item.word]);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    fadeLabel.setValue(0);
    quoteOpacity.setValue(0);
    setVisibleCount(0);

    const labelAnim = Animated.timing(fadeLabel, {
      toValue: 1,
      duration: 480,
      useNativeDriver: true,
    });
    labelAnim.start();

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const delayId = setTimeout(() => {
      let i = 0;
      intervalId = setInterval(() => {
        i += 1;
        if (i > wordTokens.length) {
          clearInterval(intervalId!);
          onWordComplete();
          setTimeout(() => {
            Animated.timing(quoteOpacity, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }).start();
          }, 150);
          return;
        }
        const ch = wordTokens[i - 1]?.ch;
        if (ch && ch !== " ") Haptics.selectionAsync();
        setVisibleCount(i);
      }, TYPEWRITER_MS);
    }, 300);

    return () => {
      labelAnim.stop();
      clearTimeout(delayId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [isActive]);

  return (
    <View style={[text.container, { width }]}>
      <Animated.Text style={[text.label, { opacity: fadeLabel }]}>
        {item.label}
      </Animated.Text>
      <View style={text.wordRow}>
        {wordTokens.slice(0, visibleCount).map((tok, i) => (
          <FadeLetter key={i} ch={tok.ch} charStyle={text.word} />
        ))}
      </View>

      {/* translucent quote box — fades in after typewriter finishes */}
      <Animated.View style={[text.quoteBox, { opacity: quoteOpacity }]}>
        <Text style={text.quote}>{item.quote}</Text>
        <TouchableOpacity
          onPress={() => WebBrowser.openBrowserAsync(item.link)}
          activeOpacity={0.7}
        >
          <Text style={text.author}>{item.author}</Text>
          <Text style={text.journal}>{item.journal}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const text = StyleSheet.create({
  container: {
    paddingHorizontal: 28,
    paddingTop: 4,
  },
  label: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  wordRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    marginBottom: 34,
    minHeight: isSmallDevice ? 46 : 56,
  },
  word: {
    fontSize: isSmallDevice ? 42 : 52,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 46 : 56,
  },
  quoteBox: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  quote: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    fontFamily: Fonts.mono,
    lineHeight: 20,
    textAlign: "center",
  },
  author: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    fontFamily: Fonts.mono,
    textAlign: "center",
    marginTop: 2,
  },
  journal: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    fontFamily: Fonts.mono,
    textAlign: "center",
    textDecorationLine: "underline",
  },
});

// ─── dot indicator ────────────────────────────────────────────────────────────

function Dots({
  dotAnims,
}: {
  dotAnims: Animated.Value[];
}) {
  return (
    <View style={dots.row}>
      {SLIDES.map((_, i) => (
        <Animated.View
          key={i}
          style={[dots.dot, { opacity: dotAnims[i] }]}
        />
      ))}
    </View>
  );
}

const dots = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 20,
    paddingBottom: 8,
  },
  dot: {
    width: 22,
    height: 4,
    borderRadius: 100,
    backgroundColor: "#fff",
  },
});

// ─── main screen ──────────────────────────────────────────────────────────────

const IMG_SIZE = isSmallDevice ? width * 0.56 : width * 0.62;

export default function Screen10() {
  usePostHogScreenViewed({
    screen: "onboarding/screen10",
    component: "Screen10",
    screen_number: 10,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const listRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [titleDone, setTitleDone] = useState(false);
  const fadeBtn = useRef(new Animated.Value(0)).current;

  const dotAnims = useRef(
    SLIDES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0.25))
  ).current;

  const imgOpacities = useRef(
    SLIDES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))
  ).current;

  useEffect(() => {
    fadeIn();
  }, []);

  useEffect(() => {
    setTitleDone(false);
    fadeBtn.setValue(0);
  }, [activeIndex]);

  useEffect(() => {
    Animated.timing(fadeBtn, {
      toValue: titleDone ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [titleDone]);

  const buttonBg = fadeBtn.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.18)", "rgba(255,255,255,1)"],
  });
  const buttonTextColor = fadeBtn.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.35)", "rgba(26,0,0,1)"],
  });

  useEffect(() => {
    // Animate dots
    dotAnims.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: i === activeIndex ? 1 : 0.25,
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

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (activeIndex < SLIDES.length - 1) {
      const next = activeIndex + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    } else {
      navigateTo("/(onboarding)/screen11");
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <MeshGradientView
        style={StyleSheet.absoluteFill}
        columns={3}
        rows={3}
        colors={BG_COLORS}
        points={BG_POINTS}
        smoothsColors
      />

      <SafeAreaView style={styles.safe} edges={["top"]}>
        {/* Dots */}
        <Dots dotAnims={dotAnims} />

        {/* Stacked crossfading images */}
        <View style={[styles.imageArea, { height: IMG_SIZE }]}>
          {SLIDES.map((slide, i) => (
            <Animated.View
              key={i}
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

        {/* Text carousel */}
        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          scrollEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleScroll}
          renderItem={({ item, index }) => (
            <TextSlide
              item={item}
              isActive={index === activeIndex}
              onWordComplete={() => setTitleDone(true)}
            />
          )}
          style={styles.list}
        />
      </SafeAreaView>

      {/* Continue button — sticky footer */}
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <TouchableOpacity
          onPress={titleDone ? handleContinue : undefined}
          activeOpacity={titleDone ? 0.85 : 1}
          disabled={!titleDone}
        >
          <Animated.View style={[styles.btn, { backgroundColor: buttonBg }]}>
            <Animated.Text style={[styles.btnText, { color: buttonTextColor }]}>
              continue
            </Animated.Text>
          </Animated.View>
        </TouchableOpacity>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  list: { flexGrow: 0 },
  imageArea: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
    marginBottom: 20,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: 10,
  },
  btn: {
    borderRadius: 20,
    paddingVertical: isSmallDevice ? 15 : 18,
    alignItems: "center",
  },
  btnText: {
    fontSize: 17,
    fontFamily: Fonts.mono,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
