
import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, FlatList, Dimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AnimatedGlow, { GlowEvent } from 'react-native-animated-glow';
import { Colors, Fonts, Layout } from '@/constants/theme';
import { GlowPresets } from '@/constants/glow';

const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 40 - 24) / 3; // (screen width - padding - gaps) / 3
const ITEM_RADIUS = 24; // Rounded square radius

const FREQUENCIES = [
  { id: '174', hz: '174 Hz', label: 'Pain', color: Colors.chakra.red },
  { id: '285', hz: '285 Hz', label: 'Rejuvenate', color: Colors.chakra.orange },
  { id: '396', hz: '396 Hz', label: 'Fear', color: Colors.chakra.yellow },
  { id: '417', hz: '417 Hz', label: 'Trauma', color: Colors.chakra.green },
  { id: '528', hz: '528 Hz', label: 'Transform', color: Colors.chakra.blue },
  { id: '639', hz: '639 Hz', label: 'Love', color: Colors.chakra.indigo },
  { id: '741', hz: '741 Hz', label: 'Detox', color: Colors.chakra.violet },
  { id: '852', hz: '852 Hz', label: 'Anxiety', color: '#FF00FF' },
  { id: '963', hz: '963 Hz', label: 'Awaken', color: '#FFFFFF' },
];

const BACKGROUNDS = ['Brainwaves', 'Singing Bowl'];

const FrequencyItem = ({ item, isSelected, onSelect }: { item: typeof FREQUENCIES[0], isSelected: boolean, onSelect: () => void }) => {
  const [glowState, setGlowState] = useState<GlowEvent>('default');

  // Sync glow state with selection
  React.useEffect(() => {
    if (isSelected) {
      setGlowState('press');
    } else {
      setGlowState('default');
    }
  }, [isSelected]);

  return (
    <AnimatedGlow
      preset={GlowPresets.vaporwave(ITEM_RADIUS, item.color)}
      activeState={glowState}
    >
      <Pressable 
        style={[
          styles.freqCard, 
          { borderColor: item.color },
          isSelected && { backgroundColor: item.color + '20' }
        ]}
        onPress={onSelect}
        // Remove direct state setting on press to let selection control it, 
        // or combine them. But for "clicked on gets to current thickness", 
        // we should probably rely on isSelected.
        // Actually, user said "only when iyts clicked on", which implies selection state.
      >
        <Text style={styles.freqHz}>{item.hz}</Text>
        <Text style={styles.freqLabel}>{item.label}</Text>
      </Pressable>
    </AnimatedGlow>
  );
};

export default function SelectionScreen() {
  const router = useRouter();
  const [selectedFreq, setSelectedFreq] = useState('528');
  const [selectedBg, setSelectedBg] = useState('Brainwaves');

  const renderFreqItem = ({ item }: { item: typeof FREQUENCIES[0] }) => {
    return (
      <FrequencyItem 
        item={item} 
        isSelected={selectedFreq === item.id} 
        onSelect={() => setSelectedFreq(item.id)} 
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
        <View>
          <Text style={styles.mainTitle}>layer healing{'\n'}frequency</Text>
          <Text style={styles.subtitle}>
            select a frequency and soundscape{'\n'}that aligns with your subconscious{'\n'}goals
          </Text>
        </View>
        
        <FlatList
          data={FREQUENCIES}
          renderItem={renderFreqItem}
          keyExtractor={item => item.id}
          numColumns={3}
          scrollEnabled={false}
          columnWrapperStyle={styles.freqRow}
          contentContainerStyle={styles.freqList}
        />

        <View style={styles.bgList}>
          {BACKGROUNDS.map(bg => (
            <TouchableOpacity 
              key={bg}
              style={[
                styles.bgItem,
                selectedBg === bg && styles.bgItemSelected
              ]}
              onPress={() => setSelectedBg(bg)}
            >
              <Text style={[
                styles.bgText,
                selectedBg === bg && styles.bgTextSelected
              ]}>{bg}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.mainButton}
          onPress={() => router.push('/session/playback')}
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
    justifyContent: 'space-between',
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
    justifyContent: 'space-around',
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
    marginBottom: 10,
    lineHeight: 20,
  },
  freqList: {
    flexGrow: 0,
    marginBottom: 10,
  },
  freqRow: {
    gap: 12,
    marginBottom: 12,
  },
  freqCard: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: ITEM_RADIUS,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  freqHz: {
    fontFamily: Fonts.serifBold,
    fontSize: 18,
    color: Colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  freqLabel: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  bgList: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 10,
  },
  bgItem: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.textSecondary,
  },
  bgItemSelected: {
    borderColor: Colors.text,
    backgroundColor: '#333',
  },
  bgText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  bgTextSelected: {
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
