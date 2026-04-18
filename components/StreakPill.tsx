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
    Promise.all([
      SecureStore.getItemAsync('streak_count'),
      SecureStore.getItemAsync('streak_last_date'),
    ]).then(([countRaw, lastDateStr]) => {
      const count = countRaw ? parseInt(countRaw, 10) : 0;
      if (!lastDateStr) return;
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      const yest = new Date(t);
      yest.setDate(t.getDate() - 1);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isAlive = lastDateStr === fmt(t) || lastDateStr === fmt(yest);
      setStreak(isAlive ? count : 0);
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
    marginBottom: 3.5,
  },
});
