import React, { useEffect } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors, Fonts } from '@/constants/theme';
import { AmbientSoundId, NATURE_SOUNDS, NOISE_SOUNDS } from './playback-constants';

type Props = {
  visible: boolean;
  onClose: () => void;
  activeAmbientSounds: Set<AmbientSoundId>;
  onToggle: (id: AmbientSoundId) => void;
  ambientVolume: number;
  onAmbientVolumeChange: (v: number) => void;
};

const SHEET_H_PAD = 20;
const TILE_GAP = 10;
const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const TILE_W = Math.floor((SCREEN_W - SHEET_H_PAD * 2 - TILE_GAP * 2) / 3);
const DISMISS_THRESHOLD = 80;
const DISMISS_VELOCITY = 800;

export default function AmbientModal({
  visible,
  onClose,
  activeAmbientSounds,
  onToggle,
  ambientVolume,
  onAmbientVolumeChange,
}: Props) {
  const sliderWidthSV = useSharedValue(0);
  const progressSV = useSharedValue(ambientVolume);
  const translateY = useSharedValue(0);
  const [pct, setPct] = React.useState(Math.round(ambientVolume * 100));

  // Reset sheet position each time modal opens
  useEffect(() => {
    if (visible) translateY.value = 0;
  }, [visible, translateY]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const sliderStyle = useAnimatedStyle(() => ({
    width: progressSV.value * sliderWidthSV.value,
  }));
  const labelClipStyle = useAnimatedStyle(() => ({ width: progressSV.value * sliderWidthSV.value }));
  const labelFullStyle = useAnimatedStyle(() => ({ width: sliderWidthSV.value }));

  const dismissGesture = Gesture.Pan()
    .onUpdate((e) => {
      // Only allow dragging downward
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
        translateY.value = withTiming(SCREEN_H, { duration: 260 }, () => {
          runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const volumeGesture = Gesture.Pan()
    .onStart((e) => {
      if (sliderWidthSV.value > 0) {
        const p = Math.max(0, Math.min(1, e.x / sliderWidthSV.value));
        progressSV.value = p;
        runOnJS(onAmbientVolumeChange)(p);
        runOnJS(setPct)(Math.round(p * 100));
      }
    })
    .onUpdate((e) => {
      if (sliderWidthSV.value > 0) {
        const p = Math.max(0, Math.min(1, e.x / sliderWidthSV.value));
        progressSV.value = p;
        runOnJS(onAmbientVolumeChange)(p);
        runOnJS(setPct)(Math.round(p * 100));
      }
    });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              {/* Draggable header — handle + title */}
              <GestureDetector gesture={dismissGesture}>
                <View style={styles.header}>
                  <View style={styles.handle} />
                  <Text style={styles.title}>Ambient Noise</Text>
                </View>
              </GestureDetector>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 110 }}
              >
                <Text style={styles.sectionLabel}>Nature</Text>
                <View style={styles.grid}>
                  {NATURE_SOUNDS.map((s) => {
                    const active = activeAmbientSounds.has(s.id);
                    const disabled = !s.asset;
                    return (
                      <Pressable
                        key={s.id}
                        style={[styles.tile, active && styles.tileActive, disabled && styles.tileDisabled]}
                        onPress={() => onToggle(s.id)}
                        disabled={disabled}
                      >
                        <Text style={[styles.tileText, active && styles.tileTextActive]}>{s.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.sectionLabel}>Noise</Text>
                <View style={styles.grid}>
                  {NOISE_SOUNDS.map((s) => {
                    const active = activeAmbientSounds.has(s.id);
                    return (
                      <Pressable
                        key={s.id}
                        style={[styles.tile, active && styles.tileActive]}
                        onPress={() => onToggle(s.id)}
                      >
                        <Text style={[styles.tileText, active && styles.tileTextActive]}>{s.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Floating pill slider */}
              <View style={styles.floatingSlider} pointerEvents="box-none">
                <GestureDetector gesture={volumeGesture}>
                  <View
                    style={styles.pillTrack}
                    onLayout={(e) => { sliderWidthSV.value = e.nativeEvent.layout.width; }}
                  >
                    <Animated.View style={[styles.pillFill, sliderStyle]} />
                    {/* White label — visible over dark empty area */}
                    <View style={styles.labelLayer} pointerEvents="none">
                      <Text style={styles.pillLabelWhite}>{pct}%</Text>
                    </View>
                    {/* Black label clipped to fill width */}
                    <Animated.View style={[styles.labelClipOuter, labelClipStyle]} pointerEvents="none">
                      <Animated.View style={[styles.labelClipInner, labelFullStyle]}>
                        <Text style={styles.pillLabelBlack}>{pct}%</Text>
                      </Animated.View>
                    </Animated.View>
                  </View>
                </GestureDetector>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SHEET_H_PAD,
    paddingTop: 12,
    maxHeight: '82%',
  },
  header: {
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 28,
    color: Colors.text,
    marginBottom: 22,
  },
  sectionLabel: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 10,
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
    marginBottom: 20,
  },
  tile: {
    width: TILE_W,
    height: TILE_W,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tileActive: {
    borderColor: Colors.chakra.orange,
    backgroundColor: 'rgba(255,149,0,0.08)',
  },
  tileDisabled: {
    opacity: 0.35,
  },
  tileText: {
    fontFamily: Fonts.serif,
    fontSize: 15,
    color: Colors.text,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  tileTextActive: {
    color: Colors.chakra.orange,
  },
  floatingSlider: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SHEET_H_PAD,
    paddingBottom: 32,
    paddingTop: 16,
  },
  pillTrack: {
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  pillFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22,
  },
  labelLayer: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillLabelWhite: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: '#fff',
    letterSpacing: 0.4,
  },
  labelClipOuter: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  labelClipInner: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillLabelBlack: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: '#000',
    letterSpacing: 0.4,
  },
});
