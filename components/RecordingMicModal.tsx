import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ScalePressable } from '@/components/ScalePressable';
import { Ionicons } from '@expo/vector-icons';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from '@/lib/expo-audio';
import type { RecordingInput } from '@/lib/expo-audio';
import { setRecordingMicPref } from '@/lib/recording-mic-preference';
import { Colors, Fonts, Layout } from '@/constants/theme';

function friendlyType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('built') || t.includes('builtin')) return 'Built-in';
  if (t.includes('bluetooth')) return 'Bluetooth';
  if (t.includes('headset') || t.includes('headphones')) return 'Headset / wired';
  if (t.includes('usb')) return 'USB';
  return type;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onApplied: (summary: string) => void;
};

function RecordingMicModalContent({ onClose, onApplied }: Omit<Props, 'visible'>) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [inputs, setInputs] = useState<RecordingInput[]>([]);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUid, setSavingUid] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const perm = await getRecordingPermissionsAsync();
      if (!perm.granted) {
        const next = await requestRecordingPermissionsAsync();
        if (!next.granted) {
          setError('Microphone access is needed to list inputs.');
          setLoading(false);
          return;
        }
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await recorder.prepareToRecordAsync();
      const list = recorder.getAvailableInputs?.() ?? [];
      let cur: RecordingInput | null = null;
      try {
        cur = (await recorder.getCurrentInput?.()) ?? null;
      } catch {
        cur = list[0] ?? null;
      }
      setInputs(list);
      setCurrentUid(cur?.uid ?? list[0]?.uid ?? null);
    } catch {
      setError('Could not read microphones. Try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Intentionally once per mount: fresh AudioRecorder from useAudioRecorder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (item: RecordingInput) => {
    setSavingUid(item.uid);
    setError(null);
    try {
      recorder.setInput?.(item.uid);
      const summary = item.name?.trim() || friendlyType(item.type);
      await setRecordingMicPref({ uid: item.uid, name: summary });
      setCurrentUid(item.uid);
      onApplied(summary);
      onClose();
    } catch {
      setError('Could not switch to that microphone.');
    } finally {
      setSavingUid(null);
    }
  };

  return (
    <View style={styles.popup}>
      <View style={styles.popupHeader}>
        <Text style={styles.popupTitle}>Microphone</Text>
        <ScalePressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="close" size={26} color={Colors.text} />
        </ScalePressable>
      </View>
      <Text style={styles.popupHint}>
        Pick an input below; voice recordings will use it when available.
      </Text>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.chakra.blue} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <ScalePressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryLabel}>Retry</Text>
          </ScalePressable>
        </View>
      ) : inputs.length === 0 ? (
        <Text style={styles.emptyText}>No extra inputs reported — using the built-in mic.</Text>
      ) : (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {inputs.map((item) => {
            const selected = item.uid === currentUid;
            const primary = item.name?.trim() || 'Microphone';
            const sub = friendlyType(item.type);
            const busy = savingUid === item.uid;
            return (
              <ScalePressable
                key={item.uid}
                style={({ pressed }) => [styles.inputRow, pressed && styles.inputRowPressed]}
                onPress={() => void pick(item)}
                disabled={busy}
              >
                <View style={styles.inputRowText}>
                  <Text style={styles.inputName}>{primary}</Text>
                  <Text style={styles.inputType}>{sub}</Text>
                </View>
                {busy ? (
                  <ActivityIndicator size="small" color={Colors.chakra.blue} />
                ) : selected ? (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.chakra.blue} />
                ) : (
                  <Ionicons name="ellipse-outline" size={22} color={Colors.textSecondary} />
                )}
              </ScalePressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

export function RecordingMicModal({ visible, onClose, onApplied }: Props) {
  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.popupWrap} onPress={(e) => e.stopPropagation()}>
          {visible ? (
            <RecordingMicModalContent onClose={onClose} onApplied={onApplied} />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  popupWrap: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  popup: {
    backgroundColor: '#1A1A1E',
    borderRadius: 15,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
      default: {},
    }),
  },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 8,
  },
  popupTitle: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    color: Colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  popupHint: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  list: {
    maxHeight: 320,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  inputRowPressed: {
    opacity: 0.75,
  },
  inputRowText: {
    flex: 1,
    marginRight: 12,
  },
  inputName: {
    fontFamily: Fonts.mono,
    fontSize: 16,
    color: Colors.text,
  },
  inputType: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  centered: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: Layout.borderRadius,
    backgroundColor: '#2A2A32',
  },
  retryLabel: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.chakra.blue,
  },
  emptyText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.textSecondary,
    paddingVertical: 24,
  },
});
