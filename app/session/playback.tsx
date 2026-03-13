import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  runOnJS,
  withTiming
} from 'react-native-reanimated';
import AnimatedGlow, { GlowEvent } from 'react-native-animated-glow';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts } from '@/constants/theme';
import { GlowPresets } from '@/constants/glow';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export default function PlaybackScreen() {
  const router = useRouter();
  const { text } = useLocalSearchParams<{ text?: string }>();
  const insets = useSafeAreaInsets();
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(50); // 0-100
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  
  // Volume slider shared value (0 to 1)
  const volumeProgress = useSharedValue(0.5);
  const sliderWidth = useSharedValue(0);
  const playScale = useSharedValue(1);

  useEffect(() => {
    // Sync glow state with playing state if needed, or just use press
    // For now we rely on user interaction
  }, [isPlaying]);

  // Slider Gesture
  const panGesture = Gesture.Pan()
    .onStart((e) => {
      // Set initial value based on touch position relative to slider width
      // We'll need the slider width, so we'll measure it or assume layout
    })
    .onUpdate((e) => {
        // Since we can't easily get the width inside the worklet without measuring, 
        // we'll assume the slider takes up most of the width minus padding.
        // Let's rely on a simpler approach: update progress based on delta
        // But for a slider, we want absolute position.
        // We'll use the onLayout to get the width.
    });
    
  // Since we need layout measurements for the slider, let's use a simpler approach 
  // where we just use the touch position relative to the view.
  // Or better, just use a percentage based on `e.x`.
  
  const [sliderLayout, setSliderLayout] = useState({ width: 0, x: 0 });

  const updateVolume = (progress: number) => {
    const newVol = Math.round(progress * 100);
    setVolume(Math.max(0, Math.min(100, newVol)));
  };

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const gesture = Gesture.Pan()
    .onStart((e) => {
      runOnJS(triggerHaptic)();
      if (sliderLayout.width > 0) {
        const newProgress = Math.max(0, Math.min(1, e.x / sliderLayout.width));
        volumeProgress.value = newProgress;
        runOnJS(updateVolume)(newProgress);
      }
    })
    .onUpdate((e) => {
      if (sliderLayout.width > 0) {
        const newProgress = Math.max(0, Math.min(1, e.x / sliderLayout.width));
        volumeProgress.value = newProgress;
        runOnJS(updateVolume)(newProgress);
      }
    });

  const sliderStyle = useAnimatedStyle(() => ({
    width: `${volumeProgress.value * 100}%`,
  }));
  
  const thumbStyle = useAnimatedStyle(() => ({
    left: `${volumeProgress.value * 100}%`,
  }));

  const playButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

  const message =
    typeof text === 'string' && text.trim().length > 0
      ? text.trim()
      : 'I am deeply loved in healthy, reciprocal relationships';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
        {/* Background */}
        <LinearGradient
            colors={[Colors.background, '#1A0B2E', Colors.background]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
        />
        
        <SafeAreaView
            style={[
              styles.safeArea,
              { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }
            ]}
            edges={[]}
        >
            {/* Top Progress Bar */}
            <View style={styles.topProgressContainer}>
                <View style={[styles.topProgressBar, { width: '20%' }]} />
            </View>

            {/* Header Info */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerLabel}>Affirmation</Text>
                    <Text style={styles.headerValue}>0/3</Text>
                </View>
                <View style={styles.headerRight}>
                    <View style={styles.hzRow}>
                        <Ionicons name="musical-notes" size={14} color={Colors.chakra.blue} />
                        <Text style={[styles.headerLabel, {color: Colors.chakra.blue}]}>528 Hz</Text>
                    </View>
                    <Text style={styles.headerValue}>Brainwaves</Text>
                </View>
            </View>

            {/* Main Content */}
            <View style={styles.contentContainer}>
                <Text style={styles.setLabel}>Set 1</Text>
                
                <View style={styles.cardGlowWrapper}>
                    <AnimatedGlow
                        preset={GlowPresets.chakra(28, [...Colors.chakra.gradient], 10, 14)}
                        activeState="default"
                    >
                        <View style={styles.cardContainer}>
                            <View style={styles.card}>
                                <Text style={styles.affirmationText}>
                                    “{message}”
                                </Text>
                            </View>
                        </View>
                    </AnimatedGlow>
                </View>

                {/* Controls Section */}
                <View style={styles.controlsContainer}>
                    <AnimatedGlow
                        preset={GlowPresets.chakra(32, [Colors.chakra.orange, Colors.chakra.orange], 8, 5)}
                        activeState={glowState}
                    >
                        <Animated.View style={playButtonAnimatedStyle}>
                            <Pressable
                                style={styles.playButton}
                                onPress={() => setIsPlaying(!isPlaying)}
                                onPressIn={() => {
                                  triggerHaptic();
                                  playScale.value = withTiming(0.88, { duration: 80 });
                                  setGlowState('press');
                                }}
                                onPressOut={() => {
                                  playScale.value = withTiming(1, { duration: 120 });
                                  setGlowState('default');
                                }}
                            >
                                <Ionicons name={isPlaying ? "pause" : "play"} size={32} color="#000" />
                            </Pressable>
                        </Animated.View>
                    </AnimatedGlow>
                    <Text style={styles.timerText}>05:00</Text>
                </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <Pressable
                    onPress={() => router.back()}
                    onPressIn={() => triggerHaptic()}
                >
                    <Text style={styles.finishText}>Finish Session</Text>
                </Pressable>

                <View style={styles.volumeContainer}>
                    <View style={styles.volumeIconWrapper}>
                        <Text style={styles.volumeText}>{volume}%</Text>
                        <MaterialCommunityIcons name="head-flash" size={24} color="#FFF" />
                    </View>
                    
                    <GestureDetector gesture={gesture}>
                        <View 
                            style={styles.sliderContainer}
                            onLayout={(e) => setSliderLayout(e.nativeEvent.layout)}
                        >
                            <View style={styles.sliderTrack}>
                                <Animated.View style={[styles.sliderFill, sliderStyle]} />
                                <Animated.View style={[styles.sliderThumb, thumbStyle]} />
                            </View>
                        </View>
                    </GestureDetector>
                </View>
            </View>
        </SafeAreaView>
        </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
  },
  topProgressContainer: {
    width: '100%',
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    marginTop: 10,
  },
  topProgressBar: {
    height: '100%',
    backgroundColor: Colors.chakra.orange,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 10,
  },
  headerLabel: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  headerValue: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.text,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  hzRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center', 
    alignItems: 'center',
    paddingVertical: 6,
  },
  setLabel: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  cardGlowWrapper: {
    marginVertical: 14,
  },
  cardContainer: {
    width: '100%',
    aspectRatio: 1.25,
    maxHeight: height * 0.26,
    maxWidth: 320,
    borderRadius: 28,
  },
  card: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#FFF',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  affirmationText: {
    fontFamily: Fonts.serif,
    fontSize: 24,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 32,
  },
  controlsContainer: {
    alignItems: 'center',
    marginTop: 28,
    gap: 12,
  },
  playButton: {
    width: 72, // Slightly smaller
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.chakra.orange,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.chakra.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  timerText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.text,
    marginTop: 4,
  },
  footer: {
    width: '100%',
    gap: 20, // Reduced gap
    alignItems: 'center',
    marginBottom: 10,
  },
  finishText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  volumeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
    paddingVertical: 10, // Hit slop area
  },
  volumeIconWrapper: {
    alignItems: 'center',
    gap: 2,
    width: 40,
  },
  volumeText: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Colors.text,
  },
  sliderContainer: {
    flex: 1,
    height: 40, // Taller hit area for gesture
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    width: '100%',
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: Colors.chakra.orange,
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.chakra.orange,
    marginLeft: -8, // Center the thumb
  },
});
