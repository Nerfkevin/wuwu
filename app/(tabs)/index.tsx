
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AnimatedGlow, { GlowEvent } from '@/lib/animated-glow';
import { Colors, Fonts } from '@/constants/theme';
import { GlowPresets } from '@/constants/glow';
import StreakPill from '@/components/StreakPill';

const { width } = Dimensions.get('window');
const BUTTON_SIZE = width * 0.55;

export default function HomeScreen() {
  const router = useRouter();
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  const [pressing, setPressing] = useState(false);
  const [activated, setActivated] = useState(false);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const orbSpin = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const orbSpinLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      setActivated(false);
      setPressing(false);
      setGlowState('default');
      pressScale.setValue(1);
    }, [pressScale])
  );

  useEffect(() => {
    if (!pressing && !activated) {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoopRef.current.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseAnim.setValue(1);
    }

    return () => {
      pulseLoopRef.current?.stop();
    };
  }, [activated, pressing, pulseAnim]);

  useEffect(() => {
    orbSpinLoopRef.current?.stop();
    orbSpin.setValue(0);
    orbSpinLoopRef.current = Animated.loop(
      Animated.timing(orbSpin, {
        toValue: 1,
        duration: 152000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    orbSpinLoopRef.current.start();
    return () => {
      orbSpinLoopRef.current?.stop();
    };
  }, [orbSpin]);

  const orbRotate = orbSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handlePressIn = () => {
    setPressing(true);
    setGlowState('press');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    Animated.timing(pressScale, {
      toValue: 0.9,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    setPressing(false);
    setGlowState('default');

    Animated.timing(pressScale, {
      toValue: 1.2,
      duration: 250,
      useNativeDriver: true,
    }).start();

    if (!activated) {
      setActivated(true);
      router.push('/session/selection');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={[Colors.background, '#1A0B2E', Colors.background]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.titleContainer}>
        <Text style={styles.title}>Wu-Wu</Text>
        <StreakPill />
      </View>

      <View style={styles.content}>
        <Animated.View
          style={[
            styles.buttonContainer,
            {
              transform: [
                { scale: Animated.multiply(pressing ? scaleAnim : pulseAnim, pressScale) },
              ],
            },
          ]}>
          <AnimatedGlow 
            preset={GlowPresets.chakra(
              BUTTON_SIZE / 2,
              [
                '#3D0F6B',
                '#5B21B6',
                '#7C3AED',
                '#5B21B6',
                '#9333EA',
                '#A855F7',
                '#C026D3',
                '#A855F7',
                '#9333EA',
                '#5B21B6',
                '#7C3AED',
                '#5B21B6',
                '#3D0F6B',
              ],
              30,
              30
            )}
            activeState={glowState}
          >
            <Pressable 
              style={styles.mainButton}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
            >
              <Animated.Image
                source={require('@/assets/images/onboarding/orb1.png')}
                style={[styles.orbImage, { transform: [{ rotate: orbRotate }] }]}
                resizeMode="contain"
              />
            </Pressable>
          </AnimatedGlow>
        </Animated.View>
      </View>
      
      {/* Subtle bottom gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(255, 0, 110, 0.1)']}
        style={styles.bottomGradient}
        pointerEvents="none"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  titleContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 62,
    gap: 10,
    zIndex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 64,
    color: Colors.text,
    letterSpacing: 4,
  },
  buttonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    paddingVertical: 80,
    marginVertical: -80,
  },
  mainButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbImage: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
});
