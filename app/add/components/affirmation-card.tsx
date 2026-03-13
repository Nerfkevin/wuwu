import React from 'react';
import { Dimensions, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import AnimatedGlow from 'react-native-animated-glow';
import { GlowPresets } from '@/constants/glow';

const { height } = Dimensions.get('window');

type AffirmationCardProps = {
  children: React.ReactNode;
  glowColor?: string;
  useGlow?: boolean;
  wrapperStyle?: StyleProp<ViewStyle>;
};

export default function AffirmationCard({
  children,
  glowColor = '#FFFFFF',
  useGlow = true,
  wrapperStyle,
}: AffirmationCardProps) {
  const card = (
    <View style={[styles.cardContainer, wrapperStyle]}>
      <View style={styles.card}>{children}</View>
    </View>
  );

  if (!useGlow) {
    return card;
  }

  return (
    <AnimatedGlow preset={GlowPresets.chakra(28, [glowColor, glowColor], 10, 14)} activeState="default">
      {card}
    </AnimatedGlow>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: '100%',
    aspectRatio: 1.25,
    maxHeight: height * 0.26,
    maxWidth: 320,
    borderRadius: 28,
  },
  card: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#FFF',
    borderRadius: 28,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
});
