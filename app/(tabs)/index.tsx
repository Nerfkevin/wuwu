
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AnimatedGlow, { GlowEvent } from '@/lib/animated-glow';
import { Colors, Fonts } from '@/constants/theme';
import { GlowPresets } from '@/constants/glow';

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
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

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

  const handlePressIn = () => {
    setPressing(true);
    setGlowState('press');

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
      <View style={styles.titleContainer}>
        <Text style={styles.title}>Wu-Wu</Text>
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
            preset={GlowPresets.chakra(BUTTON_SIZE / 2)}
            activeState={glowState}
          >
            <Pressable 
              style={styles.mainButton}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
            >
              <LinearGradient
                colors={Colors.chakra.gradient}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.buttonText}>Start Session</Text>
              </LinearGradient>
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
    zIndex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  mainButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    elevation: 10,
    shadowColor: Colors.chakra.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  buttonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BUTTON_SIZE / 2,
  },
  buttonText: {
    fontFamily: Fonts.serifBold,
    fontSize: 24,
    color: Colors.text,
    textAlign: 'center',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
});
