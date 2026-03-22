import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

const HANDLE_W = 22;
const TRACK_H = 68;
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
  const isDragging = useRef(false);

  const leftPx = useRef(new Animated.Value(0)).current;
  const rightPx = useRef(new Animated.Value(300)).current;
  const scrubPx = useRef(new Animated.Value(0)).current;

  const snapLeft = useRef(0);
  const snapRight = useRef(0);
  const snapScrub = useRef(0);

  const read = (av: Animated.Value) => (av as unknown as { _value: number })._value ?? 0;

  const syncPositions = useCallback(
    (overrideW?: number) => {
      if (isDragging.current) return;
      const w = overrideW ?? trackW.current;
      if (w === 0) return;
      const { trimStartRatio, trimEndRatio, playheadRatio } = propsRef.current;
      leftPx.setValue(trimStartRatio * w);
      rightPx.setValue(trimEndRatio * w);
      const clamped = Math.max(trimStartRatio, Math.min(trimEndRatio, playheadRatio));
      scrubPx.setValue(clamped * w);
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
      syncPositions(w);
    },
    [syncPositions],
  );

  // ─── PanResponders ───────────────────────────────────────────────────────────

  const leftPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDragging.current = true;
        snapLeft.current = read(leftPx);
        propsRef.current.onTrimDragStart();
      },
      onPanResponderMove: (_, gs) => {
        const minGapPx = Math.max(8, propsRef.current.minTrimGapRatio * trackW.current);
        const newLeft = Math.max(0, Math.min(read(rightPx) - minGapPx, snapLeft.current + gs.dx));
        leftPx.setValue(newLeft);
        if (read(scrubPx) < newLeft) scrubPx.setValue(newLeft);
      },
      onPanResponderRelease: () => {
        isDragging.current = false;
        const w = trackW.current;
        if (w > 0) propsRef.current.onTrimChange(read(leftPx) / w, read(rightPx) / w);
      },
      onPanResponderTerminate: () => {
        isDragging.current = false;
      },
    }),
  ).current;

  const rightPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDragging.current = true;
        snapRight.current = read(rightPx);
        propsRef.current.onTrimDragStart();
      },
      onPanResponderMove: (_, gs) => {
        const minGapPx = Math.max(8, propsRef.current.minTrimGapRatio * trackW.current);
        const newRight = Math.min(
          trackW.current,
          Math.max(read(leftPx) + minGapPx, snapRight.current + gs.dx),
        );
        rightPx.setValue(newRight);
        if (read(scrubPx) > newRight) scrubPx.setValue(newRight);
      },
      onPanResponderRelease: () => {
        isDragging.current = false;
        const w = trackW.current;
        if (w > 0) propsRef.current.onTrimChange(read(leftPx) / w, read(rightPx) / w);
      },
      onPanResponderTerminate: () => {
        isDragging.current = false;
      },
    }),
  ).current;

  const scrubPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDragging.current = true;
        snapScrub.current = read(scrubPx);
        propsRef.current.onScrubStart();
      },
      onPanResponderMove: (_, gs) => {
        const newScrub = Math.max(
          read(leftPx),
          Math.min(read(rightPx), snapScrub.current + gs.dx),
        );
        scrubPx.setValue(newScrub);
      },
      onPanResponderRelease: () => {
        isDragging.current = false;
        const w = trackW.current;
        if (w > 0) propsRef.current.onScrubCommit(read(scrubPx) / w);
      },
      onPanResponderTerminate: () => {
        isDragging.current = false;
      },
    }),
  ).current;

  // ─── Derived display values ──────────────────────────────────────────────────

  const { audioDuration: dur } = props;
  const trimStartTime = dur * trimStartRatio;
  const trimEndTime = dur * trimEndRatio;
  const trimmedDuration = trimEndTime - trimStartTime;
  const playheadTime = dur * Math.max(trimStartRatio, Math.min(trimEndRatio, playheadRatio));

  const selectionWidth = Animated.subtract(rightPx, leftPx);

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
          <Animated.View style={[styles.shade, { left: 0, width: leftPx }]} />
          <Animated.View style={[styles.shade, { left: rightPx, right: 0 }]} />

          {/* Selection bracket (top + bottom border) */}
          <Animated.View style={[styles.selection, { left: leftPx, width: selectionWidth }]} />
        </View>

        {/* ── Floating layer: scrubber + handles (not clipped) ── */}

        {/* Scrubber */}
        <Animated.View
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          style={[styles.scrubber, { left: Animated.subtract(scrubPx, 1) }]}
          {...scrubPan.panHandlers}
        />

        {/* Left handle */}
        <Animated.View
          style={[styles.handle, { left: Animated.subtract(leftPx, HANDLE_W / 2) }]}
          {...leftPan.panHandlers}
        >
          <View style={styles.grip} />
          <View style={styles.grip} />
          <View style={styles.grip} />
        </Animated.View>

        {/* Right handle */}
        <Animated.View
          style={[styles.handle, { left: Animated.subtract(rightPx, HANDLE_W / 2) }]}
          {...rightPan.panHandlers}
        >
          <View style={styles.grip} />
          <View style={styles.grip} />
          <View style={styles.grip} />
        </Animated.View>
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
