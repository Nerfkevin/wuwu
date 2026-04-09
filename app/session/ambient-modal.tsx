import React, { useEffect, useRef } from 'react';
import {
  Animated as RNAnimated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Fonts } from '@/constants/theme';
import { AmbientSoundId, NATURE_SOUNDS, NOISE_SOUNDS, VISUAL_SOUND_IDS, withAlpha } from './playback-constants';

const NATURE_TILE_UI: Record<
  Exclude<AmbientSoundId, 'white' | 'pink' | 'brown' | 'money'>,
  { icon: string; set?: 'mci'; color: string }
> = {
  rain:     { icon: 'rainy-outline',  color: '#5B9BD5' },
  thunder:  { icon: 'flash-outline',  color: '#B07FD4' },
  ocean:    { icon: 'water-outline',  color: '#3AB8C8' },
  birds:    { icon: 'bird', set: 'mci', color: '#82C45A' },
  crickets: { icon: 'bug-outline',    color: '#C4A83A' },
  campfire: { icon: 'flame-outline',  color: '#E8773A' },
};

const NOISE_COLORS: Record<'white' | 'pink' | 'brown', string> = {
  white: '#D0D0D0',
  pink:  '#E87BA0',
  brown: '#A07850',
};

type AmbientIconInfo = { icon: string; set?: 'mci'; color: string };

function getAmbientIconInfo(id: AmbientSoundId | null): AmbientIconInfo {
  if (!id) return { icon: 'volume-medium-outline', color: Colors.textSecondary };
  if (id === 'money') return { icon: 'cash-outline', color: '#4CAF50' };
  if (id in NATURE_TILE_UI) return NATURE_TILE_UI[id as keyof typeof NATURE_TILE_UI];
  if (id in NOISE_COLORS) return { icon: 'pulse-outline', color: NOISE_COLORS[id as keyof typeof NOISE_COLORS] };
  return { icon: 'volume-medium-outline', color: Colors.textSecondary };
}

type Props = {
  visible: boolean;
  onClose: () => void;
  activeAmbientSounds: Set<AmbientSoundId>;
  onToggle: (id: AmbientSoundId) => void;
  ambientVolumes: Partial<Record<AmbientSoundId, number>>;
  onAmbientVolumeChange: (id: AmbientSoundId, v: number) => void;
};

const SHEET_H_PAD = 20;
const TILE_GAP = 10;
const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const TILE_W = Math.floor((SCREEN_W - SHEET_H_PAD * 2 - TILE_GAP * 2) / 3);
const DISMISS_THRESHOLD = 80;
const DISMISS_VELOCITY = 800;

const springPressIn = { toValue: 0.92, useNativeDriver: true, speed: 60, bounciness: 0 };
const springPressOut = { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 };

function ScalableTile({
  style,
  onPress,
  disabled,
  children,
}: {
  style: StyleProp<ViewStyle>;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const scaleAnim = useRef(new RNAnimated.Value(1)).current;
  const handlePressIn = () => { RNAnimated.spring(scaleAnim, springPressIn).start(); };
  const handlePressOut = () => { RNAnimated.spring(scaleAnim, springPressOut).start(); };
  return (
    <RNAnimated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={style}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
      >
        {children}
      </Pressable>
    </RNAnimated.View>
  );
}

export default function AmbientModal({
  visible,
  onClose,
  activeAmbientSounds,
  onToggle,
  ambientVolumes,
  onAmbientVolumeChange,
}: Props) {
  const sliderWidthSV = useSharedValue(0);
  const translateY = useSharedValue(0);

  const [focusedId, setFocusedId] = React.useState<AmbientSoundId | null>(null);
  const focusedIdSV = useSharedValue<string | null>(null);
  const focusedVolume = focusedId != null ? (ambientVolumes[focusedId] ?? 1) : 1;
  const [pct, setPct] = React.useState(100);

  const progressSV = useSharedValue(1);

  // Reset sheet + init focused sound on open
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      setFocusedId((prev) => {
        if (prev && activeAmbientSounds.has(prev)) return prev;
        if (activeAmbientSounds.size > 0) return [...activeAmbientSounds][0];
        return prev;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Sync slider + shared value to focused ambient
  useEffect(() => {
    focusedIdSV.value = focusedId;
    progressSV.value = focusedVolume;
    setPct(Math.round(focusedVolume * 100));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, focusedVolume]);

  const iconInfo = getAmbientIconInfo(focusedId);

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
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
        translateY.value = withTiming(SCREEN_H, { duration: 260 }, () => { runOnJS(onClose)(); });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const volumeGesture = Gesture.Pan()
    .onStart((e) => {
      if (sliderWidthSV.value > 0 && focusedIdSV.value) {
        const p = Math.max(0, Math.min(1, e.x / sliderWidthSV.value));
        progressSV.value = p;
        runOnJS(onAmbientVolumeChange)(focusedIdSV.value as AmbientSoundId, p);
        runOnJS(setPct)(Math.round(p * 100));
      }
    })
    .onUpdate((e) => {
      if (sliderWidthSV.value > 0 && focusedIdSV.value) {
        const p = Math.max(0, Math.min(1, e.x / sliderWidthSV.value));
        progressSV.value = p;
        runOnJS(onAmbientVolumeChange)(focusedIdSV.value as AmbientSoundId, p);
        runOnJS(setPct)(Math.round(p * 100));
      }
    });

  const handleTilePress = (id: AmbientSoundId) => {
    setFocusedId(id);
    onToggle(id);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            {/* Scrollable content — inner pressable stops tap-to-close */}
            <Pressable onPress={(e) => e.stopPropagation()}>
              {/* Draggable header */}
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
                  {NATURE_SOUNDS.filter((s) => !VISUAL_SOUND_IDS.has(s.id)).map((s) => {
                    const active = activeAmbientSounds.has(s.id);
                    const disabled = !s.asset;
                    const ui = NATURE_TILE_UI[s.id as Exclude<AmbientSoundId, 'white' | 'pink' | 'brown' | 'money'>];
                    const iconColor = active ? ui.color : Colors.textSecondary;
                    return (
                      <ScalableTile
                        key={s.id}
                        style={[
                          styles.tile,
                          active && { borderColor: ui.color, backgroundColor: withAlpha(ui.color, 0.12) },
                          disabled && styles.tileDisabled,
                        ]}
                        onPress={() => handleTilePress(s.id)}
                        disabled={disabled}
                      >
                        <View style={styles.ambientTileInner}>
                          {ui.set === 'mci'
                            ? <MaterialCommunityIcons name={ui.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={28} color={iconColor} />
                            : <Ionicons name={ui.icon as keyof typeof Ionicons.glyphMap} size={28} color={iconColor} />
                          }
                          <Text style={[styles.ambientTileText, active && { color: ui.color }]} numberOfLines={2}>
                            {s.label}
                          </Text>
                        </View>
                      </ScalableTile>
                    );
                  })}
                </View>

                <Text style={styles.sectionLabel}>Noise</Text>
                <View style={styles.grid}>
                  {NOISE_SOUNDS.map((s) => {
                    const active = activeAmbientSounds.has(s.id);
                    const color = NOISE_COLORS[s.id as 'white' | 'pink' | 'brown'];
                    const iconColor = active ? color : Colors.textSecondary;
                    return (
                      <ScalableTile
                        key={s.id}
                        style={[
                          styles.tile,
                          active && { borderColor: color, backgroundColor: withAlpha(color, 0.12) },
                        ]}
                        onPress={() => handleTilePress(s.id)}
                      >
                        <View style={styles.ambientTileInner}>
                          <Ionicons name="pulse-outline" size={28} color={iconColor} />
                          <Text style={[styles.ambientTileText, active && { color }]} numberOfLines={2}>
                            {s.label}
                          </Text>
                        </View>
                      </ScalableTile>
                    );
                  })}
                </View>

                <Text style={styles.sectionLabel}>Visual</Text>
                <View style={styles.grid}>
                  <ScalableTile
                    style={[styles.tile, activeAmbientSounds.has('money') && styles.tileRainActive]}
                    onPress={() => handleTilePress('money')}
                  >
                    <View style={styles.ambientTileInner}>
                      <Ionicons
                        name="cash-outline"
                        size={28}
                        color={activeAmbientSounds.has('money') ? '#4CAF50' : Colors.textSecondary}
                      />
                      <Text style={[styles.ambientTileText, activeAmbientSounds.has('money') && styles.tileRainTextActive]} numberOfLines={2}>
                        Make it Rain
                      </Text>
                    </View>
                  </ScalableTile>
                </View>
              </ScrollView>
            </Pressable>

            {/* Floating pill slider — direct child of sheet so position:absolute bottom:0
                anchors to the sheet's rendered bounds, not the (possibly taller) scroll content */}
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.floatingSlider}>
              <GestureDetector gesture={volumeGesture}>
                <View
                  style={styles.pillTrack}
                  onLayout={(e) => { sliderWidthSV.value = e.nativeEvent.layout.width; }}
                >
                  <Animated.View style={[styles.pillFill, sliderStyle]} />

                  {/* Ambient icon — left side of pill */}
                  <View style={styles.pillIconLayer} pointerEvents="none">
                    {iconInfo.set === 'mci'
                      ? <MaterialCommunityIcons name={iconInfo.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={22} color={iconInfo.color} />
                      : <Ionicons name={iconInfo.icon as keyof typeof Ionicons.glyphMap} size={22} color={iconInfo.color} />
                    }
                  </View>

                  {/* White % label — visible over dark empty area */}
                  <View style={styles.labelLayer} pointerEvents="none">
                    <Text style={styles.pillLabelWhite}>{focusedId ? `${pct}%` : '—'}</Text>
                  </View>
                  {/* Black % label clipped to fill width */}
                  <Animated.View style={[styles.labelClipOuter, labelClipStyle]} pointerEvents="none">
                    <Animated.View style={[styles.labelClipInner, labelFullStyle]}>
                      <Text style={styles.pillLabelBlack}>{focusedId ? `${pct}%` : '—'}</Text>
                    </Animated.View>
                  </Animated.View>
                </View>
              </GestureDetector>
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
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SHEET_H_PAD,
    paddingTop: 12,
    maxHeight: '92%',
  },
  header: {
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
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
    backgroundColor: withAlpha(Colors.text, 0.06),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tileActive: {
    borderColor: Colors.chakra.orange,
    backgroundColor: withAlpha(Colors.chakra.orange, 0.12),
  },
  tileDisabled: {
    opacity: 0.35,
  },
  tileRainActive: {
    borderColor: '#4CAF50',
    backgroundColor: 'rgba(76,175,80,0.12)',
  },
  tileRainTextActive: {
    color: '#4CAF50',
  },
  tileTextActive: {
    color: Colors.chakra.orange,
  },
  ambientTileInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  ambientTileText: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    lineHeight: 20,
    color: Colors.text,
    textAlign: 'center',
  },
  floatingSlider: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SHEET_H_PAD,
    paddingBottom: 40,
    paddingTop: 16,
    backgroundColor: 'transparent',
  },
  pillTrack: {
    height: 50,
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
  pillIconLayer: {
    position: 'absolute',
    left: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelLayer: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillLabelWhite: {
    fontFamily: Fonts.mono,
    fontSize: 12,
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
    fontSize: 12,
    color: '#000',
    letterSpacing: 0.4,
  },
});
