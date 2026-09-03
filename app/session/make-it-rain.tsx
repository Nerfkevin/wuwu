import React, { memo, useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  cancelAnimation,
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

const BillItem = memo(({ cfg, paused, speedMultiplier = 1, delayMultiplier }: {
  cfg: BillConfig;
  paused: boolean;
  speedMultiplier?: number;
  delayMultiplier?: number;
}) => {
  const fallY = useSharedValue(FALL_FROM);
  const swing = useSharedValue(0);
  const flip = useSharedValue(0);

  useEffect(() => {
    if (paused) {
      cancelAnimation(fallY);
      cancelAnimation(swing);
      cancelAnimation(flip);
      fallY.value = FALL_FROM;
      swing.value = 0;
      flip.value = 0;
      return;
    }

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

    return () => {
      cancelAnimation(fallY);
      cancelAnimation(swing);
      cancelAnimation(flip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const wrapStyle = useAnimatedStyle(() => {
    const t = swing.value - 0.5;
    return {
      transform: [
        { translateY: fallY.value },
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
  }));

  return (
    <Animated.View
      style={[styles.billWrap, { left: cfg.left, opacity: cfg.opacity }, wrapStyle]}
      shouldRasterizeIOS
      renderToHardwareTextureAndroid
    >
      <Animated.View style={[styles.bill, frontFlipStyle]}>
        <Image source={FRONT} style={styles.bill} contentFit="contain" cachePolicy="memory-disk" />
      </Animated.View>
      <Animated.View style={[styles.bill, styles.billBack, backFlipStyle]}>
        <Image source={BACK} style={styles.bill} contentFit="contain" cachePolicy="memory-disk" />
      </Animated.View>
    </Animated.View>
  );
});
BillItem.displayName = 'BillItem';

const MakeItRain = memo(({
  paused = false,
  speedMultiplier = 1,
  delayMultiplier,
}: {
  paused?: boolean;
  speedMultiplier?: number;
  delayMultiplier?: number;
}) => (
  <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
    {BILLS.map((cfg) => (
      <BillItem
        key={cfg.id}
        cfg={cfg}
        paused={paused}
        speedMultiplier={speedMultiplier}
        delayMultiplier={delayMultiplier}
      />
    ))}
  </View>
));
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
  billBack: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
