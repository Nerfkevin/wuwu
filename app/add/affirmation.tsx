import React, { useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MeshGradientView } from 'expo-mesh-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '@/constants/theme';
import { AFFIRMATION_PILLARS, PillarKey } from '@/constants/affirmations';
import AnimatedGlow from '@/lib/animated-glow';
import { GlowPresets } from '@/constants/glow';
import { usePostHogScreenViewed } from '@/lib/posthog';

const normalizeParam = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const PILLAR_SHORT: Record<string, string> = {
  Confidence: 'self-worth',
  Abundance: 'wealth',
  Love: 'love',
  Health: 'health',
  Peace: 'peace',
  Focus: 'focus',
};

export default function AffirmationScreen() {
  usePostHogScreenViewed({
    screen: "add/affirmation",
    component: "AffirmationScreen",
  });

  const router = useRouter();
  const params = useLocalSearchParams<{ pillar?: string }>();
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);

  const pillarKey = useMemo(() => {
    const raw = normalizeParam(params.pillar);
    if (raw && raw in AFFIRMATION_PILLARS) {
      return raw as PillarKey;
    }
    return 'Confidence';
  }, [params.pillar]);

  const pillar = AFFIRMATION_PILLARS[pillarKey];
  const isContinueEnabled = selectedMessage !== null;

  const handleContinue = () => {
    if (!selectedMessage) {
      return;
    }
    router.push({
      pathname: '/add/recording',
      params: { text: selectedMessage, pillar: pillarKey },
    });
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
        <View style={styles.hero}>
          <AnimatedGlow preset={GlowPresets.ripple(24, pillar.color)} activeState="hover">
            <View style={[styles.pillarIconWrap, { borderColor: pillar.color }]}>
              <Ionicons name={pillar.icon as any} size={32} color={pillar.color} />
              <Text style={[styles.pillarShort, { color: pillar.color }]}>
                {PILLAR_SHORT[pillarKey] ?? pillarKey.toLowerCase()}
              </Text>
            </View>
          </AnimatedGlow>
          <View style={styles.heroText}>
            <Text style={styles.pillarTitle}>{pillar.title}</Text>
            <Text style={styles.heroSubtitle}>choose an affirmation message:</Text>
          </View>
        </View>

        <FlatList
          data={pillar.messages}
          keyExtractor={(item) => item}
          renderItem={({ item }) => {
            const isSelected = item === selectedMessage;
            return (
              <TouchableOpacity
                style={[styles.messageCard, isSelected && styles.messageCardSelected]}
                onPress={() => { Haptics.selectionAsync(); setSelectedMessage(item); }}
                activeOpacity={0.75}
              >
                <Text style={[styles.messageText, isSelected && styles.messageTextSelected]}>{item}</Text>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
        />
      </View>

      <View style={styles.footer}>
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
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
    paddingHorizontal: 24,
  },
  pillarIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    gap: 6,
  },
  pillarShort: {
    fontSize: 12,
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  heroText: {
    flex: 1,
  },
  pillarTitle: {
    fontFamily: Fonts.mono,
    fontSize: 18,
    color: Colors.text,
  },
  heroSubtitle: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  messageList: {
    gap: 9,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  messageCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 15,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  messageCardSelected: {
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  messageText: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
  },
  messageTextSelected: {
    color: '#fff',
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  mainButton: {
    height: 56,
    borderRadius: 15,
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
