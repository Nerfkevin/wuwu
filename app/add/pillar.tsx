
import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Fonts } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import AnimatedGlow, { GlowEvent } from '@/lib/animated-glow';
import { GlowPresets } from '@/constants/glow';

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

  return (
    <View style={styles.cardWrapper}>
      <AnimatedGlow
        preset={GlowPresets.ripple(24, item.color)}
        activeState={isSelected ? 'hover' : glowState}
      >
        <Pressable
          style={[
            styles.card,
            isSelected && { backgroundColor: `${item.color}1C` },
          ]}
          onPress={onSelect}
          onPressIn={() => setGlowState('press')}
          onPressOut={() => setGlowState('default')}
        >
          <View style={styles.cardContent}>
            <Ionicons name={item.icon} size={34} color={item.color} style={styles.cardIcon} />
            <Text style={styles.cardTitle}>{item.title}</Text>
          </View>
        </Pressable>
      </AnimatedGlow>
    </View>
  );
}

export default function PillarScreen() {
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
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.titleBlock}>
          <Text style={styles.mainTitle}>select affirmation{'\n'}pillar</Text>
          <Text style={styles.subtitle}>
            choose a pillar for your affirmation{'\n'}or write one from scratch
          </Text>
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
            setIsWriteOwn(true);
          }}
        >
          <Ionicons name="pencil" size={18} color={Colors.text} />
          <Text style={styles.writeOwnText}>write your own</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.mainButton, !isContinueEnabled && styles.mainButtonDisabled]}
          disabled={!isContinueEnabled}
          onPress={handleContinue}
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
    backgroundColor: Colors.background,
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
  mainTitle: {
    fontFamily: Fonts.mono,
    fontSize: 32,
    color: Colors.text,
    marginBottom: 8,
    lineHeight: 40,
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
    marginBottom: 16,
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
    backgroundColor: '#1A1A1E',
    borderRadius: 20,
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
    fontFamily: Fonts.serifBold,
    fontSize: 18,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 24,
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
  footer: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: Colors.background,
  },
  mainButton: {
    height: 56,
    borderRadius: 28,
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
