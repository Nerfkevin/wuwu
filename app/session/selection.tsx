
import React, { useState, useRef } from 'react';
import * as Haptics from 'expo-haptics';
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
  Animated,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { MeshGradientView } from 'expo-mesh-gradient';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AnimatedGlow, { GlowEvent } from '@/lib/animated-glow';
import { Colors, Fonts } from '@/constants/theme';
import { GlowPresets } from '@/constants/glow';
import { getPlaylists, Playlist, ALL_PLAYLIST_ID } from '@/lib/playlist-store';
import { getLastPlaylistId, setLastPlaylistId } from '@/lib/session-prefs';
import { useFrequencyPreview } from '@/lib/use-frequency-preview';
import { usePostHog, usePostHogScreenViewed } from '@/lib/posthog';

const { width } = Dimensions.get('window');
const isSmallDevice = width < 380;
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

const FrequencyItem = ({ item, isSelected, isGreyed, onSelect }: { item: typeof FREQUENCIES[0], isSelected: boolean, isGreyed?: boolean, onSelect: () => void }) => {
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  const scaleAnim = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    setGlowState(isSelected ? 'press' : 'default');
  }, [isSelected]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, isGreyed && { opacity: 0.35 }]}>
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
          onPress={() => { Haptics.selectionAsync(); onSelect(); }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <Text style={styles.freqHz}>{item.hz}</Text>
          <Text style={styles.freqLabel}>{item.label}</Text>
        </Pressable>
      </AnimatedGlow>
    </Animated.View>
  );
};

const BrainwaveCard = ({ item, isSelected, isGreyed, onSelect }: { item: typeof BRAINWAVES[0], isSelected: boolean, isGreyed?: boolean, onSelect: () => void }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, isGreyed && { opacity: 0.35 }]}>
      <AnimatedGlow
        preset={GlowPresets.vaporwave(ITEM_RADIUS, item.color)}
        activeState={isSelected ? 'press' : 'default'}
      >
        <Pressable
          style={[
            styles.freqCard,
            { borderColor: item.color },
            isSelected && { backgroundColor: item.color + '20' },
          ]}
          onPress={() => { Haptics.selectionAsync(); onSelect(); }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <Text style={styles.freqHz}>{item.name}</Text>
          <Text style={styles.brainwaveHz}>{item.hz}</Text>
          <Text style={styles.freqLabel}>{item.label}</Text>
        </Pressable>
      </AnimatedGlow>
    </Animated.View>
  );
};

const BgButton = ({ bg, isSelected, onPress }: { bg: string; isSelected: boolean; onPress: () => void }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={[styles.bgItem, isSelected && styles.bgItemSelected]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Text style={[styles.bgText, isSelected && styles.bgTextSelected]}>{bg}</Text>
      </Pressable>
    </Animated.View>
  );
};

export default function SelectionScreen() {
  usePostHogScreenViewed({
    screen: "session/selection",
    component: "SelectionScreen",
  });

  const ph = usePostHog();
  const router = useRouter();
  const [selectedBowlFreq, setSelectedBowlFreq] = useState('528');
  const [selectedPureFreq, setSelectedPureFreq] = useState('528');
  const [selectedBg, setSelectedBg] = useState('Brainwaves');
  const [selectedBrainwave, setSelectedBrainwave] = useState('alpha');

  const activeFreq = selectedBg === 'Singing Bowl' ? selectedBowlFreq : selectedPureFreq;
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [chosenPlaylistId, setChosenPlaylistId] = useState<string>(ALL_PLAYLIST_ID);
  const { previewFrequency, previewBrainwave, stopPreview, fadeOutPreview } = useFrequencyPreview();
  const continueBtnScale = useRef(new Animated.Value(1)).current;

  const renderFreqItem = ({ item }: { item: typeof FREQUENCIES[0] }) => {
    const setter = selectedBg === 'Singing Bowl' ? setSelectedBowlFreq : setSelectedPureFreq;
    return (
      <FrequencyItem
        item={item}
        isSelected={activeFreq === item.id}
        isGreyed={activeFreq !== item.id}
        onSelect={() => { setter(item.id); previewFrequency(item.id, selectedBg); }}
      />
    );
  };

  const navigateToPlayback = (playlistId: string) => {
    const color =
      selectedBg === 'Brainwaves'
        ? (BRAINWAVES.find(b => b.id === selectedBrainwave)?.color ?? Colors.chakra.blue)
        : (FREQUENCIES.find(f => f.id === activeFreq)?.color ?? Colors.chakra.blue);
    router.replace({
      pathname: '/session/playback',
      params: { freq: activeFreq, bg: selectedBg, brainwave: selectedBrainwave, color, playlistId },
    });
  };

  const handleContinue = async () => {
    stopPreview();
    const pls = await getPlaylists();
    if (pls.length === 0) {
      try {
        ph?.capture('session_started', {
          background: selectedBg,
          frequency: selectedBg !== 'Brainwaves' ? (activeFreq ?? null) : null,
          brainwave: selectedBg === 'Brainwaves' ? (selectedBrainwave ?? null) : null,
          playlist_id: ALL_PLAYLIST_ID,
        });
      } catch {}
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
    try {
      ph?.capture('session_started', {
        background: selectedBg,
        frequency: selectedBg !== 'Brainwaves' ? (activeFreq ?? null) : null,
        brainwave: selectedBg === 'Brainwaves' ? (selectedBrainwave ?? null) : null,
        playlist_id: chosenPlaylistId,
      });
    } catch {}
    navigateToPlayback(chosenPlaylistId);
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
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); stopPreview(); router.back(); }} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.contentPadded}>
          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <View style={styles.titleTextBlock}>
                <Text style={styles.mainTitle}>layer healing{'\n'}frequency</Text>
              </View>
              {selectedBg === 'Brainwaves' ? (
                <MaterialCommunityIcons name="brain" size={46} color={Colors.textSecondary} style={styles.titleIcon} />
              ) : (
                <MaterialCommunityIcons
                  name={selectedBg === 'Singing Bowl' ? 'bowl-mix-outline' : 'pulse'}
                  size={46}
                  color={Colors.textSecondary}
                  style={styles.titleIcon}
                />
              )}
            </View>
          </View>
        </View>

        {/* Full-bleed horizontal strip (same pattern as library playlist bar) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bgList}
          style={styles.bgScroll}
        >
          {BACKGROUNDS.map(bg => (
            <BgButton
              key={bg}
              bg={bg}
              isSelected={selectedBg === bg}
              onPress={() => { Haptics.selectionAsync(); fadeOutPreview(); setSelectedBg(bg); }}
            />
          ))}
        </ScrollView>

        <View style={styles.bgDividerRow}>
          <LinearGradient
            colors={[
              'rgba(200, 200, 205, 0)',
              'rgba(200, 200, 205, 0.35)',
              'rgba(220, 220, 225, 0.85)',
              'rgba(200, 200, 205, 0.35)',
              'rgba(200, 200, 205, 0)',
            ]}
            locations={[0, 0.22, 0.5, 0.78, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.bgDividerGradient}
          />
        </View>

        <View style={styles.contentLower}>
        {/* Fixed-height grid so layout doesn't shift between Brainwaves (2 rows) and Solfeggio (3 rows) */}
        <View style={styles.freqGridContainer}>
        {selectedBg === 'Brainwaves' ? (
          <View style={styles.freqList}>
            <View style={[styles.freqRow, { flexDirection: 'row' }]}>
              {BRAINWAVES.slice(0, 3).map(item => (
                <BrainwaveCard
                  key={item.id}
                  item={item}
                  isSelected={selectedBrainwave === item.id}
                  isGreyed={selectedBrainwave !== item.id}
                  onSelect={() => { setSelectedBrainwave(item.id); previewBrainwave(item.id); }}
                />
              ))}
            </View>
            <View style={[styles.freqRow, { flexDirection: 'row', justifyContent: 'center' }]}>
              {BRAINWAVES.slice(3).map(item => (
                <BrainwaveCard
                  key={item.id}
                  item={item}
                  isSelected={selectedBrainwave === item.id}
                  isGreyed={selectedBrainwave !== item.id}
                  onSelect={() => { setSelectedBrainwave(item.id); previewBrainwave(item.id); }}
                />
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

        {selectedBg === 'Brainwaves' ? (
          <Text style={styles.brainwaveDisclaimer}>
            *This is a Binaural Frequency, best used with stereo headphones.
          </Text>
        ) : null}
        </View>
      </View>

      <Animated.View style={[styles.continueBtnWrapper, { transform: [{ scale: continueBtnScale }] }]}>
        <TouchableOpacity
          style={styles.mainButton}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleContinue(); }}
          onPressIn={() => Animated.spring(continueBtnScale, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
          onPressOut={() => Animated.spring(continueBtnScale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start()}
        >
          <View style={styles.buttonContent}>
            <Text style={styles.buttonText}>continue</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

      <Modal
        visible={showPlaylistModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPlaylistModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPlaylistModal(false)}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>choose affirmation track</Text>

            <TouchableOpacity
              style={[styles.playlistRow, chosenPlaylistId === ALL_PLAYLIST_ID && styles.playlistRowSelected]}
              onPress={() => { Haptics.selectionAsync(); handlePickPlaylist(ALL_PLAYLIST_ID); }}
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
                    onPress={() => { Haptics.selectionAsync(); handlePickPlaylist(item.id); }}
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

            <TouchableOpacity style={styles.startBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleStartWithPlaylist(); }}>
              <Text style={styles.startBtnText}>start manifesting</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07041A',
    justifyContent: 'space-between',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: isSmallDevice ? 44 : 60,
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
  contentPadded: {
    paddingHorizontal: 20,
  },
  contentLower: {
    flex: 1,
    paddingHorizontal: 20,
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
  titleIcon: {
    marginLeft: 12,
    marginTop: 4,
    opacity: 0.6,
  },
  mainTitle: {
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 32 : 40,
    color: Colors.text,
    marginBottom: 8,
    lineHeight: isSmallDevice ? 40 : 50,
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
    fontSize: isSmallDevice ? 18 : 24,
    color: Colors.text,
    marginBottom: 2,
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
    marginTop: 12,
  },
  brainwaveDisclaimer: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginTop: 6,
    marginBottom: 4,
    textAlign: 'center',
  },
  bgDividerRow: {
    width: '100%',
    marginTop: 2,
    marginBottom: 10,
  },
  bgDividerGradient: {
    height: 2,
    width: '100%',
    borderRadius: 1,
  },
  bgScroll: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
  },
  bgList: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bgItem: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  bgItemSelected: {
    borderColor: Colors.chakra.violet,
    backgroundColor: 'rgba(139,92,246,0.18)',
  },
  bgText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  bgTextSelected: {
    color: Colors.text,
  },
  continueBtnWrapper: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
  },
  mainButton: {
    height: 56,
    borderRadius: 15,
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
    borderRadius: 20,
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
