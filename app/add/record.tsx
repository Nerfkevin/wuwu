
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing 
} from 'react-native-reanimated';
import { Colors, Fonts, Layout } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { usePostHogScreenViewed } from '@/lib/posthog';
import { ScalePressable } from '@/components/ScalePressable';

export default function RecordScreen() {
  usePostHogScreenViewed({
    screen: "add/record",
    component: "RecordScreen",
  });

  const router = useRouter();
  const { text } = useLocalSearchParams();
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const pulse = useSharedValue(1);

  const [effects, setEffects] = useState({
    enhance: false,
    echo: false,
    reverb: false,
  });

  useEffect(() => {
    if (isRecording) {
      pulse.value = withRepeat(
        withTiming(1.2, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulse.value = withTiming(1);
    }
  }, [isRecording, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: isRecording ? 0.6 : 0.3,
  }));

  const handleRecordToggle = () => {
    if (isRecording) {
      setIsRecording(false);
      setHasRecorded(true);
      // Simulate auto-playback start
      setTimeout(() => setIsPlaying(true), 500);
    } else {
      setIsRecording(true);
      setHasRecorded(false);
    }
  };

  const toggleEffect = (effect: keyof typeof effects) => {
    setEffects(prev => ({ ...prev, [effect]: !prev[effect] }));
  };

  const handleSave = () => {
    // In a real app, save to storage/DB
    router.dismissAll();
    router.push('/(tabs)/library');
  };

  return (
    <View style={styles.container}>
      <View style={styles.cardContainer}>
        <LinearGradient
          colors={Colors.chakra.gradient}
          style={styles.cardBorder}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.cardContent}>
            <Text style={styles.affirmationText}>{text}</Text>
          </View>
        </LinearGradient>
      </View>

      {!hasRecorded ? (
        <View style={styles.recordContainer}>
          <Animated.View style={[styles.pulseCircle, animatedStyle]}>
            <LinearGradient
              colors={Colors.chakra.gradient}
              style={styles.gradientFill}
            />
          </Animated.View>
          
          <ScalePressable
            style={styles.recordBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); handleRecordToggle(); }}
            scaleTo={0.9}
          >
             <Ionicons name={isRecording ? "stop" : "mic"} size={40} color={Colors.text} />
          </ScalePressable>
          <Text style={styles.hintText}>{isRecording ? "Recording..." : "Tap to Record"}</Text>
        </View>
      ) : (
        <View style={styles.playbackContainer}>
          <View style={styles.controlsRow}>
            <ScalePressable onPress={() => setIsPlaying(!isPlaying)} scaleTo={0.94}>
              <Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={64} color={Colors.chakra.blue} />
            </ScalePressable>
            <ScalePressable onPress={() => setHasRecorded(false)} style={styles.retakeBtn}>
              <Text style={styles.retakeText}>Retake</Text>
            </ScalePressable>
          </View>

          <View style={styles.effectsRow}>
            {['Enhance', 'Echo', 'Reverb'].map((effect) => (
              <ScalePressable
                key={effect}
                style={[
                  styles.effectBtn,
                  effects[effect.toLowerCase() as keyof typeof effects] && styles.effectBtnActive
                ]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleEffect(effect.toLowerCase() as keyof typeof effects); }}
              >
                <Text style={[
                  styles.effectText,
                  effects[effect.toLowerCase() as keyof typeof effects] && styles.effectTextActive
                ]}>{effect}</Text>
              </ScalePressable>
            ))}
          </View>

          <View style={styles.actionRow}>
            <ScalePressable style={styles.deleteBtn} onPress={() => router.back()}>
              <Ionicons name="trash-outline" size={24} color={Colors.textSecondary} />
            </ScalePressable>
            
            <ScalePressable style={styles.saveBtn} onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); handleSave(); }}>
              <LinearGradient
                colors={Colors.chakra.gradient}
                style={styles.saveGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.saveText}>Save to Library</Text>
              </LinearGradient>
            </ScalePressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    padding: 20,
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  cardContainer: {
    width: '100%',
    aspectRatio: 1,
    marginTop: 40,
  },
  cardBorder: {
    flex: 1,
    padding: 2,
    borderRadius: Layout.borderRadius,
  },
  cardContent: {
    flex: 1,
    backgroundColor: '#151518',
    borderRadius: Layout.borderRadius - 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  affirmationText: {
    fontFamily: Fonts.serif,
    fontSize: 28,
    color: Colors.text,
    textAlign: 'center',
  },
  recordContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 60,
  },
  pulseCircle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  gradientFill: {
    flex: 1,
    borderRadius: 60,
    opacity: 0.5,
  },
  recordBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.text,
    zIndex: 1,
  },
  hintText: {
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
    marginTop: 20,
  },
  playbackContainer: {
    width: '100%',
    gap: 30,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  retakeBtn: {
    padding: 10,
  },
  retakeText: {
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
  },
  effectsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  effectBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  effectBtnActive: {
    borderColor: Colors.chakra.blue,
    backgroundColor: 'rgba(0, 187, 249, 0.1)',
  },
  effectText: {
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
    fontSize: 12,
  },
  effectTextActive: {
    color: Colors.chakra.blue,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  deleteBtn: {
    padding: 16,
    backgroundColor: '#222',
    borderRadius: 30,
  },
  saveBtn: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
  },
  saveGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontFamily: Fonts.serifBold,
    fontSize: 18,
    color: Colors.text,
  },
});
