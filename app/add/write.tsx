
import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TouchableWithoutFeedback,
  Keyboard,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AnimatedGlow, { GlowEvent } from '@/lib/animated-glow';
import { Colors, Fonts } from '@/constants/theme';
import { GlowPresets } from '@/constants/glow';
import { Ionicons } from '@expo/vector-icons';
import AffirmationCard from './components/affirmation-card';
import { usePostHogScreenViewed } from '@/lib/posthog';

export default function WriteScreen() {
  usePostHogScreenViewed({
    screen: "add/write",
    component: "WriteScreen",
  });

  const router = useRouter();
  const { pillar } = useLocalSearchParams();
  const [text, setText] = useState('');
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  const ctaAnimation = useRef(new Animated.Value(0)).current;
  const screenFade = useRef(new Animated.Value(1)).current;
  const hasText = text.trim().length > 0;

  useEffect(() => {
    Animated.timing(ctaAnimation, {
      toValue: hasText ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [hasText, ctaAnimation]);

  const handleNext = () => {
    if (!hasText) {
      return;
    }
    Keyboard.dismiss();
    Animated.timing(screenFade, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      router.push({
        pathname: '/add/recording',
        params: { text: text.trim(), pillar },
      });
      screenFade.setValue(1);
    });
  };

  const ctaTranslateY = ctaAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <Animated.View style={[styles.screenContent, { opacity: screenFade }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>write your affirmation</Text>
          </View>

          <AffirmationCard useGlow={false} wrapperStyle={styles.cardWrap}>
            <TextInput
              style={styles.input}
              placeholder="I am..."
              placeholderTextColor="#9A9A9A"
              multiline
              value={text}
              onChangeText={setText}
              autoFocus
              textAlignVertical="center"
            />
          </AffirmationCard>

          <Animated.View
            pointerEvents={hasText ? 'auto' : 'none'}
            style={[
              styles.recordButtonWrap,
              { opacity: ctaAnimation, transform: [{ translateY: ctaTranslateY }] },
            ]}
          >
            <AnimatedGlow preset={GlowPresets.chakra(28)} activeState={glowState}>
              <Pressable
                style={styles.recordButton}
                onPress={handleNext}
                onPressIn={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setGlowState('press'); }}
                onPressOut={() => setGlowState('default')}
              >
                <View style={styles.buttonContent}>
                  <Ionicons name="mic" size={22} color="#000000" />
                  <Text style={styles.buttonText}>record</Text>
                </View>
              </Pressable>
            </AnimatedGlow>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screenContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 44,
  },
  header: {
    width: '100%',
    paddingTop: 62,
    paddingBottom: 18,
  },
  headerTitle: {
    fontFamily: Fonts.mono,
    fontSize: 22,
    color: Colors.text,
    textAlign: 'center',
  },
  cardWrap: {
    marginTop: 10,
  },
  input: {
    width: '100%',
    maxHeight: '100%',
    fontFamily: Fonts.serif,
    fontSize: 28,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 36,
  },
  recordButtonWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 28,
  },
  recordButton: {
    width: '100%',
    maxWidth: 320,
    height: 56,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  buttonContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: {
    fontFamily: Fonts.mono,
    fontSize: 18,
    color: '#000000',
  },
});
