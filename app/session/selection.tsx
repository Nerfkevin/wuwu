
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Pressable,
  ScrollView,
  Modal,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AnimatedGlow, { GlowEvent } from '@/lib/animated-glow';
import { Colors, Fonts } from '@/constants/theme';
import { GlowPresets } from '@/constants/glow';
import { getPlaylists, Playlist, ALL_PLAYLIST_ID } from '@/lib/playlist-store';
import { getLastPlaylistId, setLastPlaylistId } from '@/lib/session-prefs';

const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 40 - 24) / 3; // (screen width - padding - gaps) / 3
const ITEM_RADIUS = 24; // Rounded square radius
// Fixed height: 3 rows × ITEM_SIZE + 2 gaps — keeps layout stable for both Brainwaves (2 rows) and Solfeggio (3 rows)
const GRID_HEIGHT = ITEM_SIZE * 3 + 12 * 2;

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

const BRAINWAVES = [
  { id: 'delta', name: 'Delta', hz: '2 Hz', label: 'Sleep', beat: 2, color: Colors.chakra.violet },
  { id: 'theta', name: 'Theta', hz: '6 Hz', label: 'Meditate', beat: 6, color: Colors.chakra.indigo },
  { id: 'alpha', name: 'Alpha', hz: '10 Hz', label: 'Relax', beat: 10, color: Colors.chakra.blue },
  { id: 'beta', name: 'Beta', hz: '18 Hz', label: 'Focus', beat: 18, color: Colors.chakra.green },
  { id: 'gamma', name: 'Gamma', hz: '40 Hz', label: 'Clarity', beat: 40, color: Colors.chakra.yellow },
];

const BACKGROUNDS = ['Brainwaves', 'Singing Bowl', 'Pure'];

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
  const [selectedBrainwave, setSelectedBrainwave] = useState('alpha');
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [chosenPlaylistId, setChosenPlaylistId] = useState<string>(ALL_PLAYLIST_ID);

  const renderFreqItem = ({ item }: { item: typeof FREQUENCIES[0] }) => {
    return (
      <FrequencyItem 
        item={item} 
        isSelected={selectedFreq === item.id} 
        onSelect={() => setSelectedFreq(item.id)} 
      />
    );
  };

  const navigateToPlayback = (playlistId: string) => {
    const color =
      selectedBg === 'Brainwaves'
        ? (BRAINWAVES.find(b => b.id === selectedBrainwave)?.color ?? Colors.chakra.blue)
        : (FREQUENCIES.find(f => f.id === selectedFreq)?.color ?? Colors.chakra.blue);
    router.push({
      pathname: '/session/playback',
      params: { freq: selectedFreq, bg: selectedBg, brainwave: selectedBrainwave, color, playlistId },
    });
  };

  const handleContinue = async () => {
    const pls = await getPlaylists();
    if (pls.length === 0) {
      navigateToPlayback(ALL_PLAYLIST_ID);
      return;
    }
    const lastId = await getLastPlaylistId();
    setChosenPlaylistId(lastId ?? ALL_PLAYLIST_ID);
    setPlaylists(pls);
    setShowPlaylistModal(true);
  };

  const handlePickPlaylist = (id: string) => {
    setChosenPlaylistId(id);
  };

  const handleStartWithPlaylist = async () => {
    await setLastPlaylistId(chosenPlaylistId);
    setShowPlaylistModal(false);
    navigateToPlayback(chosenPlaylistId);
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

        {/* BG selector — horizontal scroll, below subtitle */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bgList}
          style={styles.bgScroll}
        >
          {BACKGROUNDS.map(bg => (
            <TouchableOpacity
              key={bg}
              style={[styles.bgItem, selectedBg === bg && styles.bgItemSelected]}
              onPress={() => setSelectedBg(bg)}
            >
              <Text style={[styles.bgText, selectedBg === bg && styles.bgTextSelected]}>{bg}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Fixed-height grid so layout doesn't shift between Brainwaves (2 rows) and Solfeggio (3 rows) */}
        <View style={styles.freqGridContainer}>
        {selectedBg === 'Brainwaves' ? (
          <View style={styles.freqList}>
            <View style={[styles.freqRow, { flexDirection: 'row' }]}>
              {BRAINWAVES.slice(0, 3).map(item => (
                <AnimatedGlow
                  key={item.id}
                  preset={GlowPresets.vaporwave(ITEM_RADIUS, item.color)}
                  activeState={selectedBrainwave === item.id ? 'press' : 'default'}
                >
                  <Pressable
                    style={[
                      styles.freqCard,
                      { borderColor: item.color },
                      selectedBrainwave === item.id && { backgroundColor: item.color + '20' },
                    ]}
                    onPress={() => setSelectedBrainwave(item.id)}
                  >
                    <Text style={styles.freqHz}>{item.name}</Text>
                    <Text style={styles.brainwaveHz}>{item.hz}</Text>
                    <Text style={styles.freqLabel}>{item.label}</Text>
                  </Pressable>
                </AnimatedGlow>
              ))}
            </View>
            <View style={[styles.freqRow, { flexDirection: 'row', justifyContent: 'center' }]}>
              {BRAINWAVES.slice(3).map(item => (
                <AnimatedGlow
                  key={item.id}
                  preset={GlowPresets.vaporwave(ITEM_RADIUS, item.color)}
                  activeState={selectedBrainwave === item.id ? 'press' : 'default'}
                >
                  <Pressable
                    style={[
                      styles.freqCard,
                      { borderColor: item.color },
                      selectedBrainwave === item.id && { backgroundColor: item.color + '20' },
                    ]}
                    onPress={() => setSelectedBrainwave(item.id)}
                  >
                    <Text style={styles.freqHz}>{item.name}</Text>
                    <Text style={styles.brainwaveHz}>{item.hz}</Text>
                    <Text style={styles.freqLabel}>{item.label}</Text>
                  </Pressable>
                </AnimatedGlow>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            data={FREQUENCIES}
            renderItem={renderFreqItem}
            keyExtractor={item => item.id}
            numColumns={3}
            scrollEnabled={false}
            columnWrapperStyle={styles.freqRow}
            contentContainerStyle={styles.freqList}
          />
        )}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.mainButton} onPress={handleContinue}>
          <View style={styles.buttonContent}>
            <Text style={styles.buttonText}>continue</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Modal visible={showPlaylistModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>choose affirmation track</Text>

            <TouchableOpacity
              style={[styles.playlistRow, chosenPlaylistId === ALL_PLAYLIST_ID && styles.playlistRowSelected]}
              onPress={() => handlePickPlaylist(ALL_PLAYLIST_ID)}
            >
              <Ionicons
                name="musical-notes-outline"
                size={18}
                color={chosenPlaylistId === ALL_PLAYLIST_ID ? Colors.chakra.violet : Colors.textSecondary}
              />
              <Text style={[styles.playlistRowText, chosenPlaylistId === ALL_PLAYLIST_ID && styles.playlistRowTextSelected]}>
                All Recordings
              </Text>
              {chosenPlaylistId === ALL_PLAYLIST_ID && (
                <Ionicons name="checkmark" size={16} color={Colors.chakra.violet} />
              )}
            </TouchableOpacity>

            <View style={styles.separator} />

            <FlatList
              data={playlists}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => {
                const isChosen = chosenPlaylistId === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.playlistRow, isChosen && styles.playlistRowSelected]}
                    onPress={() => handlePickPlaylist(item.id)}
                  >
                    <Ionicons
                      name="list-outline"
                      size={18}
                      color={isChosen ? Colors.chakra.violet : Colors.textSecondary}
                    />
                    <Text style={[styles.playlistRowText, isChosen && styles.playlistRowTextSelected]}>
                      {item.name}
                    </Text>
                    {isChosen && <Ionicons name="checkmark" size={16} color={Colors.chakra.violet} />}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />

            <TouchableOpacity style={styles.startBtn} onPress={handleStartWithPlaylist}>
              <Text style={styles.startBtnText}>start</Text>
            </TouchableOpacity>
          </Pressable>
        </View>
      </Modal>
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
    justifyContent: 'space-evenly',
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
  brainwaveHz: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 2,
  },
  freqGridContainer: {
    height: GRID_HEIGHT,
  },
  bgScroll: {
    flexGrow: 0,
  },
  bgList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalBox: {
    width: '100%',
    backgroundColor: '#16112A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 24,
  },
  modalTitle: {
    fontFamily: Fonts.mono,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 16,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  playlistRowSelected: {
    backgroundColor: 'rgba(139,92,246,0.12)',
  },
  playlistRowText: {
    flex: 1,
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  playlistRowTextSelected: {
    color: Colors.text,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  startBtn: {
    marginTop: 20,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: {
    fontFamily: Fonts.mono,
    fontSize: 16,
    color: '#000000',
  },
});
