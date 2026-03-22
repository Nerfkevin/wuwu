import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '@/constants/theme';
import { AFFIRMATION_PILLARS, PillarKey } from '@/constants/affirmations';
import AnimatedGlow from '@/lib/animated-glow';
import { GlowPresets } from '@/constants/glow';

const normalizeParam = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default function AffirmationScreen() {
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
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.hero}>
          <AnimatedGlow preset={GlowPresets.ripple(24, pillar.color)} activeState="hover">
            <View style={[styles.pillarIconWrap, { borderColor: Colors.textSecondary }]}>
              <Ionicons name={pillar.icon as any} size={32} color={pillar.color} />
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
                onPress={() => setSelectedMessage(item)}
              >
                <Text style={styles.messageText}>{item}</Text>
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
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
    paddingHorizontal: 24,
  },
  pillarIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 14,
    paddingBottom: 16,
  },
  messageCard: {
    borderWidth: 1,
    borderColor: Colors.textSecondary,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: '#1A1A1E',
  },
  messageCardSelected: {
    borderColor: '#FFFFFF',
    backgroundColor: '#24242A',
  },
  messageText: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 22,
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
