import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { Colors, Fonts } from '@/constants/theme';

const HANDLE_W = 22;
const TRACK_H = 52;
const MAJOR_H = 26;
const MINOR_H = 13;

const formatTrimTime = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

type TrimEditorProps = {
  audioDuration: number;
  minTrimGapRatio: number;
  onScrubCommit: (ratio: number) => void;
  onScrubStart: () => void;
  onTrimChange: (startRatio: number, endRatio: number) => void;
  onTrimDragStart: () => void;
  playheadRatio: number;
  trimEndRatio: number;
  trimStartRatio: number;
};

export default function TrimEditor(props: TrimEditorProps) {
  const propsRef = useRef(props);
  propsRef.current = props;

  const trackW = useRef(0);
  const isDraggingRef = useRef(false);

  const trackWShared = useSharedValue(0);
  const minTrimGapRatioShared = useSharedValue(props.minTrimGapRatio);
  const leftPx = useSharedValue(0);
  const rightPx = useSharedValue(300);
  const scrubPx = useSharedValue(0);
  const snapLeft = useSharedValue(0);
  const snapRight = useSharedValue(0);
  const snapScrub = useSharedValue(0);

  const setDraggingState = useCallback((next: boolean) => {
    isDraggingRef.current = next;
  }, []);

  const emitTrimDragStart = useCallback(() => {
    propsRef.current.onTrimDragStart();
  }, []);

  const emitTrimChange = useCallback((startRatio: number, endRatio: number) => {
    propsRef.current.onTrimChange(startRatio, endRatio);
  }, []);

  const emitScrubStart = useCallback(() => {
    propsRef.current.onScrubStart();
  }, []);

  const emitScrubCommit = useCallback((ratio: number) => {
    propsRef.current.onScrubCommit(ratio);
  }, []);

  const syncPositions = useCallback(
    (overrideW?: number) => {
      if (isDraggingRef.current) return;
      const w = overrideW ?? trackW.current;
      if (w === 0) return;
      const { trimStartRatio, trimEndRatio, playheadRatio } = propsRef.current;
      leftPx.value = trimStartRatio * w;
      rightPx.value = trimEndRatio * w;
      const clamped = Math.max(trimStartRatio, Math.min(trimEndRatio, playheadRatio));
      scrubPx.value = clamped * w;
    },
    [leftPx, rightPx, scrubPx],
  );

  const { trimStartRatio, trimEndRatio, playheadRatio } = props;

  useEffect(() => {
    syncPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimStartRatio, trimEndRatio, playheadRatio]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      trackW.current = w;
      trackWShared.value = w;
      minTrimGapRatioShared.value = propsRef.current.minTrimGapRatio;
      syncPositions(w);
    },
    [minTrimGapRatioShared, syncPositions, trackWShared],
  );

  useEffect(() => {
    minTrimGapRatioShared.value = props.minTrimGapRatio;
  }, [minTrimGapRatioShared, props.minTrimGapRatio]);

  const leftGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ top: 8, bottom: 8, left: 12, right: 12 })
        .onBegin(() => {
          snapLeft.value = leftPx.value;
          runOnJS(setDraggingState)(true);
          runOnJS(emitTrimDragStart)();
        })
        .onUpdate((event) => {
          const minGapPx = Math.max(8, minTrimGapRatioShared.value * trackWShared.value);
          const newLeft = Math.max(
            0,
            Math.min(rightPx.value - minGapPx, snapLeft.value + event.translationX),
          );
          leftPx.value = newLeft;
          if (scrubPx.value < newLeft) scrubPx.value = newLeft;
        })
        .onFinalize(() => {
          const w = trackWShared.value;
          runOnJS(setDraggingState)(false);
          if (w > 0) {
            runOnJS(emitTrimChange)(leftPx.value / w, rightPx.value / w);
          }
        }),
    [
      emitTrimChange,
      emitTrimDragStart,
      leftPx,
      minTrimGapRatioShared,
      rightPx,
      scrubPx,
      setDraggingState,
      snapLeft,
      trackWShared,
    ],
  );

  const rightGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ top: 8, bottom: 8, left: 12, right: 12 })
        .onBegin(() => {
          snapRight.value = rightPx.value;
          runOnJS(setDraggingState)(true);
          runOnJS(emitTrimDragStart)();
        })
        .onUpdate((event) => {
          const minGapPx = Math.max(8, minTrimGapRatioShared.value * trackWShared.value);
          const newRight = Math.min(
            trackWShared.value,
            Math.max(leftPx.value + minGapPx, snapRight.value + event.translationX),
          );
          rightPx.value = newRight;
          if (scrubPx.value > newRight) scrubPx.value = newRight;
        })
        .onFinalize(() => {
          const w = trackWShared.value;
          runOnJS(setDraggingState)(false);
          if (w > 0) {
            runOnJS(emitTrimChange)(leftPx.value / w, rightPx.value / w);
          }
        }),
    [
      emitTrimChange,
      emitTrimDragStart,
      leftPx,
      minTrimGapRatioShared,
      rightPx,
      scrubPx,
      setDraggingState,
      snapRight,
      trackWShared,
    ],
  );

  const scrubGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ top: 8, bottom: 8, left: 12, right: 12 })
        .onBegin(() => {
          snapScrub.value = scrubPx.value;
          runOnJS(setDraggingState)(true);
          runOnJS(emitScrubStart)();
        })
        .onUpdate((event) => {
          const newScrub = Math.max(
            leftPx.value,
            Math.min(rightPx.value, snapScrub.value + event.translationX),
          );
          scrubPx.value = newScrub;
        })
        .onFinalize(() => {
          const w = trackWShared.value;
          runOnJS(setDraggingState)(false);
          if (w > 0) {
            runOnJS(emitScrubCommit)(scrubPx.value / w);
          }
        }),
    [
      emitScrubCommit,
      emitScrubStart,
      leftPx,
      rightPx,
      scrubPx,
      setDraggingState,
      snapScrub,
      trackWShared,
    ],
  );

  // ─── Derived display values ──────────────────────────────────────────────────

  const { audioDuration: dur } = props;
  const trimStartTime = dur * trimStartRatio;
  const trimEndTime = dur * trimEndRatio;
  const trimmedDuration = trimEndTime - trimStartTime;
  const playheadTime = dur * Math.max(trimStartRatio, Math.min(trimEndRatio, playheadRatio));

  const leftShadeStyle = useAnimatedStyle(() => ({
    width: leftPx.value,
  }));

  const rightShadeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rightPx.value }],
    width: Math.max(0, trackWShared.value - rightPx.value),
  }));

  const selectionStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: leftPx.value }],
    width: Math.max(0, rightPx.value - leftPx.value),
  }));

  const scrubberStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: scrubPx.value - 1 }],
  }));

  const leftHandleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: leftPx.value - HANDLE_W / 2 }],
  }));

  const rightHandleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rightPx.value - HANDLE_W / 2 }],
  }));

  // Ruler markers — vertically centred, major every 4th tick
  const markers = useMemo(() => {
    if (dur <= 0) return [];
    const niceSteps = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
    const rawStep = dur / 20;
    const step = niceSteps.find((s) => s >= rawStep) ?? 60;
    const result: { ratio: number; major: boolean }[] = [];
    let idx = 0;
    for (let t = 0; t <= dur + step * 0.01; t += step) {
      if (t > dur) break;
      result.push({ ratio: t / dur, major: idx % 4 === 0 });
      idx++;
    }
    return result;
  }, [dur]);

  return (
    <View style={styles.trimSection}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Trim</Text>
        <Text style={styles.durationLabel}>{formatTrimTime(trimmedDuration)}</Text>
      </View>

      {/*
       * Two-layer track:
       *   trackClip  — background, markers, shade, selection (overflow: hidden + rounded)
       *   floating layer — scrubber + handles (NOT clipped, renders on top)
       */}
      <View style={styles.trackWrapper} onLayout={onLayout}>
        {/* ── Clipped background layer ── */}
        <View style={styles.trackClip}>
          {/* Centre rule line */}
          <View style={styles.centreLine} />

          {/* Ruler ticks — vertically centred */}
          {markers.map((m, i) => (
            <View
              key={i}
              style={[
                styles.tick,
                m.major ? styles.tickMajor : styles.tickMinor,
                { left: `${m.ratio * 100}%` },
              ]}
            />
          ))}

          {/* Shade outside selection */}
          <Animated.View style={[styles.shade, leftShadeStyle]} />
          <Animated.View style={[styles.shade, rightShadeStyle]} />

          {/* Selection bracket (top + bottom border) */}
          <Animated.View style={[styles.selection, selectionStyle]} />
        </View>

        {/* ── Floating layer: scrubber + handles (not clipped) ── */}

        {/* Scrubber */}
        <GestureDetector gesture={scrubGesture}>
          <Animated.View style={[styles.scrubber, scrubberStyle]} />
        </GestureDetector>

        {/* Left handle */}
        <GestureDetector gesture={leftGesture}>
          <Animated.View style={[styles.handle, leftHandleStyle]}>
            <View style={styles.grip} />
            <View style={styles.grip} />
            <View style={styles.grip} />
          </Animated.View>
        </GestureDetector>

        {/* Right handle */}
        <GestureDetector gesture={rightGesture}>
          <Animated.View style={[styles.handle, rightHandleStyle]}>
            <View style={styles.grip} />
            <View style={styles.grip} />
            <View style={styles.grip} />
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.timesRow}>
        <Text style={styles.timeLabel}>{formatTrimTime(trimStartTime)}</Text>
        <Text style={styles.timeLabel}>{formatTrimTime(playheadTime)}</Text>
        <Text style={styles.timeLabel}>{formatTrimTime(trimEndTime)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  trimSection: { width: '100%', gap: 8 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  durationLabel: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.text },

  // Outer wrapper — same size as track, overflow VISIBLE so handles aren't clipped
  trackWrapper: {
    width: '100%',
    height: TRACK_H,
    position: 'relative',
  },

  // Inner clip layer — background colour + rounded corners + clips markers/shade/selection
  trackClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#181818',
  },

  centreLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: TRACK_H / 2 - 0.5,
    height: 1,
    backgroundColor: '#2C2C2C',
  },

  tick: {
    position: 'absolute',
    width: 1,
    backgroundColor: '#383838',
  },
  // Centred vertically on the track
  tickMajor: {
    height: MAJOR_H,
    top: (TRACK_H - MAJOR_H) / 2,
  },
  tickMinor: {
    height: MINOR_H,
    top: (TRACK_H - MINOR_H) / 2,
  },

  shade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.60)',
  },

  selection: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#1398FF',
  },

  // Lives in trackWrapper (not trackClip) — never clipped
  scrubber: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: 2,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
  },

  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_W,
    backgroundColor: '#1398FF',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  grip: {
    width: 10,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.70)',
  },

  timesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeLabel: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary },
});
