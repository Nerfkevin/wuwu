
import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, Pressable, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { MeshGradientView } from 'expo-mesh-gradient';
import { Colors, Fonts } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import AnimatedGlow, { GlowEvent } from '@/lib/animated-glow';
import { GlowPresets } from '@/constants/glow';
import { usePostHogScreenViewed } from '@/lib/posthog';

type PillarItem = {
  id: string;
  title: string;
  value: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const PILLARS: PillarItem[] = [
  {
    id: '1',
    title: 'Self-Worth &\nConfidence',
    value: 'Confidence',
    color: Colors.chakra.orange,
    icon: 'flash',
  },
  {
    id: '2',
    title: 'Wealth &\nAbundance',
    value: 'Abundance',
    color: Colors.chakra.green,
    icon: 'cash',
  },
  {
    id: '3',
    title: 'Love &\nRelationships',
    value: 'Love',
    color: Colors.chakra.red,
    icon: 'heart',
  },
  {
    id: '4',
    title: 'Health &\nVitality',
    value: 'Health',
    color: Colors.chakra.yellow,
    icon: 'fitness',
  },
  {
    id: '5',
    title: 'Peace &\nMental Calm',
    value: 'Peace',
    color: Colors.chakra.blue,
    icon: 'flower',
  },
  {
    id: '6',
    title: 'Focus &\nAchievement',
    value: 'Focus',
    color: Colors.chakra.indigo,
    icon: 'locate',
  },
];

function PillarCard({
  item,
  isSelected,
  onSelect,
}: {
  item: PillarItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const iconColor = isSelected ? item.color : 'rgba(255,255,255,0.4)';
  const titleColor = isSelected ? item.color : 'rgba(255,255,255,0.62)';

  const handlePressIn = () => {
    setGlowState('press');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  };
  const handlePressOut = () => {
    setGlowState('default');
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };

  return (
    <View style={styles.cardWrapper}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <AnimatedGlow
          preset={GlowPresets.ripple(24, item.color, 0.35)}
          activeState={isSelected ? 'hover' : glowState}
        >
          <Pressable
            style={[
              styles.card,
              { borderColor: isSelected ? item.color : 'rgba(255,255,255,0.14)' },
            ]}
            onPress={onSelect}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          >
            <View style={styles.cardContent}>
              <Ionicons name={item.icon} size={34} color={iconColor} style={styles.cardIcon} />
              <Text style={[styles.cardTitle, { color: titleColor }]}>{item.title}</Text>
            </View>
          </Pressable>
        </AnimatedGlow>
      </Animated.View>
    </View>
  );
}

export default function PillarScreen() {
  usePostHogScreenViewed({
    screen: "add/pillar",
    component: "PillarScreen",
  });

  const router = useRouter();
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null);
  const [isWriteOwn, setIsWriteOwn] = useState(false);

  const isContinueEnabled = selectedPillar !== null || isWriteOwn;

  const handleContinue = () => {
    if (!isContinueEnabled) {
      return;
    }

    if (isWriteOwn) {
      router.push({
        pathname: '/add/recording',
        params: { pillar: selectedPillar ?? 'Confidence', writeOwn: '1' },
      });
      return;
    }

    if (selectedPillar) {
      router.push({ pathname: '/add/affirmation', params: { pillar: selectedPillar } });
      return;
    }
  };

  const renderItem = ({ item }: { item: (typeof PILLARS)[0] }) => {
    const isSelected = selectedPillar === item.value && !isWriteOwn;

    return (
      <PillarCard
        item={item}
        isSelected={isSelected}
        onSelect={() => {
          setSelectedPillar(item.value);
          setIsWriteOwn(false);
        }}
      />
    );
  };

  return (
    <View style={styles.container}>
      <MeshGradientView
        style={StyleSheet.absoluteFill}
        columns={3}
        rows={3}
        colors={[
          '#1A0A30', '#160720', '#120530',
          '#1C1035', '#0E061A', '#120830',
          '#080220', '#0C0828', '#07041A',
        ]}
        points={[
          [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
          [0.0, 0.5], [0.5, 0.5], [1.0, 0.5],
          [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
        ]}
        smoothsColors
      />
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <View style={styles.titleTextBlock}>
              <Text style={styles.mainTitle}>select affirmation{'\n'}pillar</Text>
            </View>
            <Ionicons
              name="apps-outline"
              size={46}
              color={Colors.textSecondary}
              style={styles.titleIcon}
            />
          </View>
        </View>

        <FlatList
          data={PILLARS}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          scrollEnabled={false}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          style={styles.gridList}
        />

        <TouchableOpacity
          style={[styles.writeOwnButton, isWriteOwn && styles.writeOwnButtonSelected]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setIsWriteOwn(true);
          }}
        >
          <Ionicons name="pencil" size={18} color={Colors.text} />
          <Text style={styles.writeOwnText}>write your own</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainButton, !isContinueEnabled && styles.mainButtonDisabled]}
          disabled={!isContinueEnabled}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleContinue(); }}
        >
          <View style={styles.buttonContent}>
            <Text style={styles.buttonText}>continue</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07041A',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
    overflow: 'visible',
  },
  titleBlock: {
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  titleTextBlock: {
    flex: 1,
  },
  mainTitle: {
    fontFamily: Fonts.serif,
    fontSize: 40,
    color: Colors.text,
    marginBottom: 8,
    lineHeight: 50,
  },
  titleIcon: {
    marginLeft: 12,
    marginTop: 4,
    opacity: 0.6,
  },
  subtitle: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  grid: {
    paddingBottom: 8,
    paddingHorizontal: 0,
    overflow: 'visible',
  },
  gridList: {
    marginBottom: 14,
    overflow: 'visible',
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 30,
    overflow: 'visible',
  },
  cardWrapper: {
    flex: 1,
    maxWidth: '46%',
    overflow: 'visible',
  },
  card: {
    width: '100%',
    minHeight: 120,
    backgroundColor: 'transparent',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  cardContent: {
    width: '100%',
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 8,
  },
  cardIcon: {
    marginBottom: 2,
  },
  cardTitle: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.text,
    textAlign: 'center',
  },
  writeOwnButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.textSecondary,
    paddingVertical: 14,
    marginTop: 4,
    width: '90%',
    alignSelf: 'center',
  },
  writeOwnButtonSelected: {
    borderColor: Colors.text,
    backgroundColor: '#2A2A2A',
  },
  writeOwnText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.text,
  },
  mainButton: {
    height: 56,
    borderRadius: 15,
    marginTop: 16,
    marginBottom: 40,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  mainButtonDisabled: {
    backgroundColor: '#6E6E6E',
  },
  buttonContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: Fonts.mono,
    fontSize: 18,
    color: '#000000',
  },
});
