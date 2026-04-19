import React, { useEffect, useRef } from 'react';
import {
  Animated,
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

const SPRING_IN = { speed: 60, bounciness: 0 };
const SPRING_OUT = { speed: 40, bounciness: 6 };

export type ScalePressableProps = Omit<PressableProps, 'style'> & {
  style?: PressableProps['style'];
  /** Extra style while the finger is down (e.g. slight grey/dim overlay). */
  pressedStyle?: StyleProp<ViewStyle>;
  /** Scale multiplier while pressed (default 0.94). */
  scaleTo?: number;
  children: React.ReactNode;
};

/**
 * Pressable with spring scale-down on press in / scale-up on release.
 * Splits flex layout props onto the outer wrapper so list/grid buttons lay out correctly.
 */
export function ScalePressable({
  style,
  pressedStyle,
  onPressIn,
  onPressOut,
  disabled,
  scaleTo = 0.94,
  children,
  ...rest
}: ScalePressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (disabled) {
      scale.setValue(1);
    }
  }, [disabled, scale]);

  const runIn = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: scaleTo,
      useNativeDriver: true,
      ...SPRING_IN,
    }).start();
  };

  const runOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      ...SPRING_OUT,
    }).start();
  };

  const handlePressIn = (e: GestureResponderEvent) => {
    runIn();
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    runOut();
    onPressOut?.(e);
  };

  if (typeof style === 'function') {
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          {...rest}
          disabled={disabled}
          style={(state) => {
            const base = style(state);
            if (!pressedStyle || !state.pressed) {
              return base;
            }
            return [base, pressedStyle];
          }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          {children}
        </Pressable>
      </Animated.View>
    );
  }

  const styleArr = Array.isArray(style) ? style : style ? [style] : [];
  const flatStyle = StyleSheet.flatten(styleArr) as Record<string, unknown>;
  const { flex, flexGrow, flexShrink, flexBasis, alignSelf, width, height, ...restStyle } = flatStyle;
  const outerStyle = { flex, flexGrow, flexShrink, flexBasis, alignSelf, width, height } as ViewStyle;
  // Keep width/height on inner Pressable too so centering/layout props work correctly
  const innerStyle = { width, height, ...restStyle };

  const resolvedPressableStyle = pressedStyle
    ? (state: { pressed: boolean }) => {
        const out: StyleProp<ViewStyle>[] = [innerStyle as ViewStyle];
        if (state.pressed) {
          out.push(pressedStyle);
        }
        return out;
      }
    : (innerStyle as StyleProp<ViewStyle>);

  return (
    <Animated.View style={[outerStyle, { transform: [{ scale }] }]}>
      <Pressable
        {...rest}
        disabled={disabled}
        style={resolvedPressableStyle}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
