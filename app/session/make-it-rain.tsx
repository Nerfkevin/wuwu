import React, { memo, useEffect } from 'react';
import { usePostHogScreenViewed } from '@/lib/posthog';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const { width: SW, height: SH } = Dimensions.get('window');

const FRONT = require('../../assets/images/front.png');
const BACK = require('../../assets/images/back.png');

// Bill aspect ratio matches real $10k note (~2.35:1)
const BILL_W = 60;
const BILL_H = Math.round(BILL_W / 2.35); // ~31
const WIGGLE = 50;
const FALL_FROM = -(BILL_H + WIGGLE);
const FALL_TO = SH + WIGGLE;

const FLIP_DURATION = 1850;
const SWING_DURATION = 720;
const SWING_AMP = BILL_W / 5;
const SWING_ROT = 8;

type BillConfig = {
  id: number;
  left: number;
  duration: number;
  delay: number;
  flipDelay: number;
  swingDelay: number;
  opacity: number;
  scale: number;
};

const BILLS: BillConfig[] = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  left: (Math.random() * (SW - BILL_W * 1.5)) | 0,
  duration: (3000 + (Math.random() * 2800)) | 0,
  delay: (i * (3000 / 16) + Math.random() * 400) | 0,
  flipDelay: (Math.random() * 1000) | 0,
  swingDelay: (Math.random() * SWING_DURATION) | 0,
  opacity: 0.75 + Math.random() * 0.25,
  scale: 0.8 + Math.random() * 0.4,
}));

const BillItem = memo(({ cfg, speedMultiplier = 1, delayMultiplier }: { cfg: BillConfig; speedMultiplier?: number; delayMultiplier?: number }) => {
  const fallY = useSharedValue(FALL_FROM);
  const swing = useSharedValue(0);  // 0 → 1, alternating
  const flip = useSharedValue(0);   // 0 → 360, infinite

  useEffect(() => {
    fallY.value = withDelay(
      cfg.delay / (delayMultiplier ?? speedMultiplier),
      withRepeat(
        withTiming(FALL_TO, {
          duration: cfg.duration / speedMultiplier,
          easing: Easing.in(Easing.quad),
        }),
        -1,
        false,
      ),
    );

    swing.value = withDelay(
      cfg.swingDelay,
      withRepeat(
        withTiming(1, { duration: SWING_DURATION, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );

    flip.value = withDelay(
      cfg.flipDelay,
      withRepeat(
        withTiming(360, { duration: FLIP_DURATION, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fallStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: fallY.value }],
  }));

  const swingStyle = useAnimatedStyle(() => {
    const t = swing.value - 0.5; // -0.5 to 0.5
    return {
      transform: [
        { translateX: t * SWING_AMP * 2 },
        { rotate: `${t * SWING_ROT * 2}deg` },
      ],
    };
  });

  const frontFlipStyle = useAnimatedStyle(() => ({
    transform: [{ rotateX: `${flip.value}deg` }, { scale: cfg.scale }],
    backfaceVisibility: 'hidden' as const,
  }));

  const backFlipStyle = useAnimatedStyle(() => ({
    transform: [{ rotateX: `${flip.value + 180}deg` }, { scale: cfg.scale }],
    backfaceVisibility: 'hidden' as const,
    position: 'absolute' as const,
    top: 0,
    left: 0,
  }));

  return (
    <Animated.View style={[styles.billWrap, { left: cfg.left, opacity: cfg.opacity }, fallStyle]}>
      <Animated.View style={swingStyle}>
        <Animated.Image source={FRONT} style={[styles.bill, frontFlipStyle]} resizeMode="contain" />
        <Animated.Image source={BACK} style={[styles.bill, backFlipStyle]} resizeMode="contain" />
      </Animated.View>
    </Animated.View>
  );
});
BillItem.displayName = 'BillItem';

const MakeItRain = memo(({ speedMultiplier = 1, delayMultiplier }: { speedMultiplier?: number; delayMultiplier?: number }) => {
  usePostHogScreenViewed({
    screen: 'session/make-it-rain',
    component: 'MakeItRain',
  });
  return (
  <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
    {BILLS.map((cfg) => (
      <BillItem key={cfg.id} cfg={cfg} speedMultiplier={speedMultiplier} delayMultiplier={delayMultiplier} />
    ))}
  </View>
  );
});
MakeItRain.displayName = 'MakeItRain';

export default MakeItRain;

const styles = StyleSheet.create({
  billWrap: {
    position: 'absolute',
    top: 0,
    width: BILL_W,
    height: BILL_H,
  },
  bill: {
    width: BILL_W,
    height: BILL_H,
  },
});
