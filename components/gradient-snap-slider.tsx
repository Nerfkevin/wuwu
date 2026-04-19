import React, { useEffect } from "react";
import { View, StyleSheet, LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
} from "react-native-reanimated";

const THUMB_SIZE = 26;
const TRACK_HEIGHT = 6;

// pink → purple matching the mesh bg palette
const GRADIENT: [string, string, string] = ["#E8449A", "#B030B0", "#7B2FBE"];

interface Props {
  minimumValue: number;
  maximumValue: number;
  step?: number;
  value: number;
  onValueChange: (v: number) => void;
  style?: object;
}

export default function GradientSnapSlider({
  minimumValue,
  maximumValue,
  step = 1,
  value,
  onValueChange,
  style,
}: Props) {
  const trackWidth = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const clampedRatio = (v: number) => {
    'worklet';
    return (v - minimumValue) / (maximumValue - minimumValue);
  };

  const fillRatio = useSharedValue(clampedRatio(value));

  // sync prop → shared value when not dragging
  useEffect(() => {
    if (!isDragging.value) {
      fillRatio.value = withSpring(clampedRatio(value), { damping: 20, stiffness: 200 });
    }
  }, [value]);

  const snapValue = (rawRatio: number): number => {
    "worklet";
    const range = maximumValue - minimumValue;
    const raw = minimumValue + rawRatio * range;
    const snapped = Math.round((raw - minimumValue) / step) * step + minimumValue;
    return Math.max(minimumValue, Math.min(maximumValue, snapped));
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      isDragging.value = true;
    })
    .onUpdate((e) => {
      const r = Math.max(0, Math.min(1, e.x / trackWidth.value));
      fillRatio.value = r;
      const snapped = snapValue(r);
      runOnJS(onValueChange)(snapped);
    })
    .onFinalize(() => {
      isDragging.value = false;
      // snap thumb visually to exact step position
      fillRatio.value = withSpring(clampedRatio(snapValue(fillRatio.value)), {
        damping: 20,
        stiffness: 200,
      });
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: fillRatio.value * Math.max(0, trackWidth.value - THUMB_SIZE) }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: fillRatio.value * trackWidth.value,
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    trackWidth.value = e.nativeEvent.layout.width;
  };

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.container, style]} onLayout={onLayout}>
        {/* track */}
        <View style={styles.track}>
          <Animated.View style={[styles.fillClip, fillStyle]}>
            <LinearGradient
              colors={GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
        {/* thumb */}
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    height: THUMB_SIZE + 20,
    justifyContent: "center",
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  fillClip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden",
  },
  thumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: "#fff",
    shadowColor: "#E8449A",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 8,
    elevation: 6,
    top: "50%",
    marginTop: -(THUMB_SIZE / 2),
  },
});
