import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { Fonts } from '@/constants/theme';

export default function StreakPill() {
  const router = useRouter();
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    SecureStore.getItemAsync('streak_count').then((val) => {
      if (val) setStreak(parseInt(val, 10));
    });
  }, []);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/streak');
  };

  return (
    <Pressable style={styles.pill} onPress={handlePress}>
      <Text style={styles.text}>🔥 {streak} day streak</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: 'rgba(180, 0, 0, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255, 60, 0, 0.4)',
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 7,
    alignSelf: 'center',
  },
  text: {
    fontSize: 14,
    color: '#ff6b3d',
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
});
