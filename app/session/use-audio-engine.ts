import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioBuffer, AudioContext } from '@/lib/audio-api-core';
import * as Haptics from 'expo-haptics';
import { getSavedRecordings, SavedRecording } from '@/lib/recording-store';
import { configureBackgroundPlaybackAsync } from '@/lib/audio-playback';
import {
  TRACK_GAP_MS,
  BOWL_VOLUME,
  BINAURAL_CARRIER,
  OSC_VOLUME,
  AFFIRMATION_DEFAULT_VOLUME_PERCENT,
  AMBIENT_VOLUME,
  BINAURAL_BEATS,
  NOISE_IDS,
  NATURE_SOUNDS,
  AmbientSoundId,
  AmbientNode,
  affirmationPercentToGain,
} from './playback-constants';

const triggerHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

export type AudioEngineParams = {
  selectedBowlAudio: number;
  selectedFrequency: string;
  selectedBrainwave: string;
  shouldPlaySingingBowl: boolean;
  shouldPlayBrainwave: boolean;
  shouldPlayPure: boolean;
};

export function useAudioEngine({
  selectedBowlAudio,
  selectedFrequency,
  selectedBrainwave,
  shouldPlaySingingBowl,
  shouldPlayBrainwave,
  shouldPlayPure,
}: AudioEngineParams) {
  // ─── State ────────────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBowlMuted, setIsBowlMuted] = useState(false);
  const [isOscMuted, setIsOscMuted] = useState(false);
  const [activeAmbientSounds, setActiveAmbientSounds] = useState<Set<AmbientSoundId>>(new Set());
  const [volume, setVolume] = useState(AFFIRMATION_DEFAULT_VOLUME_PERCENT);
  const [ambientVolume, setAmbientVolume] = useState(1);
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [completedSetCount, setCompletedSetCount] = useState(0);
  const [sessionElapsedMs, setSessionElapsedMs] = useState(0);

  // ─── Refs ─────────────────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bowlGainRef = useRef<ReturnType<AudioContext['createGain']> | null>(null);
  const affirmationGainRef = useRef<ReturnType<AudioContext['createGain']> | null>(null);
  const binauralGainRef = useRef<ReturnType<AudioContext['createGain']> | null>(null);
  const bowlSourceRef = useRef<ReturnType<AudioContext['createBufferSource']> | null>(null);
  const affirmationSourceRef = useRef<ReturnType<AudioContext['createBufferSource']> | null>(null);
  const pureOscRef = useRef<ReturnType<AudioContext['createOscillator']> | null>(null);
  const leftOscRef = useRef<ReturnType<AudioContext['createOscillator']> | null>(null);
  const rightOscRef = useRef<ReturnType<AudioContext['createOscillator']> | null>(null);
  const nextTrackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const affirmationVolumeRef = useRef(affirmationPercentToGain(AFFIRMATION_DEFAULT_VOLUME_PERCENT));
  const ambientVolumeRef = useRef(1);
  const sessionElapsedMsRef = useRef(0);
  const sessionStartedAtRef = useRef<number | null>(null);
  const recordingsRef = useRef<SavedRecording[]>([]);
  const currentTrackIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const isOscMutedRef = useRef(false);
  const audioSessionConfiguredRef = useRef(false);
  const activeAmbientSoundsRef = useRef<Set<AmbientSoundId>>(new Set());
  const ambientNodesRef = useRef<Map<AmbientSoundId, AmbientNode>>(new Map());
  const ambientBuffersRef = useRef<Map<AmbientSoundId, AudioBuffer>>(new Map());
  const bowlBufferRef = useRef<AudioBuffer | null>(null);
  const affirmationBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());

  const setTrackIndex = (nextIndex: number) => {
    currentTrackIndexRef.current = nextIndex;
    setCurrentTrackIndex(nextIndex);
  };

  // ─── Timer ────────────────────────────────────────────────────────────────
  const clearNextTrackTimer = useCallback(() => {
    if (nextTrackTimerRef.current) {
      clearTimeout(nextTrackTimerRef.current);
      nextTrackTimerRef.current = null;
    }
  }, []);

  const clearSessionTimer = useCallback(() => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  const syncSessionElapsed = useCallback(() => {
    const startedAt = sessionStartedAtRef.current;
    const elapsed = startedAt
      ? sessionElapsedMsRef.current + (Date.now() - startedAt)
      : sessionElapsedMsRef.current;
    setSessionElapsedMs(elapsed);
  }, []);

  const startSessionTimer = useCallback(() => {
    if (sessionStartedAtRef.current) return;
    sessionStartedAtRef.current = Date.now();
    syncSessionElapsed();
    clearSessionTimer();
    sessionTimerRef.current = setInterval(() => {
      syncSessionElapsed();
    }, 1000);
  }, [clearSessionTimer, syncSessionElapsed]);

  const pauseSessionTimer = useCallback(() => {
    if (sessionStartedAtRef.current) {
      sessionElapsedMsRef.current += Date.now() - sessionStartedAtRef.current;
      sessionStartedAtRef.current = null;
    }
    setSessionElapsedMs(sessionElapsedMsRef.current);
    clearSessionTimer();
  }, [clearSessionTimer]);

  // ─── Audio context ────────────────────────────────────────────────────────
  const ensureAudioSession = useCallback(async () => {
    if (audioSessionConfiguredRef.current) return;
    audioSessionConfiguredRef.current = true;
    await configureBackgroundPlaybackAsync();
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const bowlGain = ctx.createGain();
    bowlGain.gain.value = isBowlMuted ? 0 : BOWL_VOLUME;
    bowlGain.connect(ctx.destination);
    bowlGainRef.current = bowlGain;

    const affirmationGain = ctx.createGain();
    affirmationGain.gain.value = affirmationVolumeRef.current;
    affirmationGain.connect(ctx.destination);
    affirmationGainRef.current = affirmationGain;

    const binauralGain = ctx.createGain();
    binauralGain.gain.value = isOscMutedRef.current ? 0 : OSC_VOLUME;
    binauralGain.connect(ctx.destination);
    binauralGainRef.current = binauralGain;

    return ctx;
  }, [isBowlMuted]);

  // ─── Source teardown ──────────────────────────────────────────────────────
  const stopAffirmationSource = useCallback(() => {
    const source = affirmationSourceRef.current;
    if (!source) return;
    source.onEnded = null;
    try { source.stop(); } catch { /* already ended */ }
    try { source.disconnect(); } catch { /* best effort */ }
    affirmationSourceRef.current = null;
  }, []);

  const stopBowlSource = useCallback(() => {
    const source = bowlSourceRef.current;
    if (!source) return;
    bowlSourceRef.current = null;
    const ctx = audioCtxRef.current;
    const gain = bowlGainRef.current;
    const FADE = 0.04;
    if (ctx && gain) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE);
      try { source.stop(now + FADE); } catch { /* already ended */ }
    } else {
      try { source.stop(); } catch { /* already ended */ }
    }
    try { source.disconnect(); } catch { /* best effort */ }
  }, []);

  // ─── Buffer loading ───────────────────────────────────────────────────────
  const loadBowlBuffer = useCallback(async () => {
    if (bowlBufferRef.current) return bowlBufferRef.current;
    const ctx = ensureAudioContext();
    const buffer = await ctx.decodeAudioData(selectedBowlAudio);
    // Short linear fade at start/end so the loop boundary is at zero amplitude.
    const FADE_SAMPLES = 512;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < FADE_SAMPLES && i < data.length; i++) {
        data[i] *= i / FADE_SAMPLES;
      }
      for (let i = 0; i < FADE_SAMPLES && i < data.length; i++) {
        data[data.length - 1 - i] *= i / FADE_SAMPLES;
      }
    }
    bowlBufferRef.current = buffer;
    return buffer;
  }, [ensureAudioContext, selectedBowlAudio]);

  const loadAffirmationBuffer = useCallback(async (recording: SavedRecording) => {
    const cached = affirmationBuffersRef.current.get(recording.id);
    if (cached) return cached;
    const ctx = ensureAudioContext();
    const buffer = await ctx.decodeAudioData(recording.uri);
    affirmationBuffersRef.current.set(recording.id, buffer);
    return buffer;
  }, [ensureAudioContext]);

  // ─── Noise generation ─────────────────────────────────────────────────────
  const createNoiseBuffer = useCallback((type: 'white' | 'pink' | 'brown'): AudioBuffer => {
    const ctx = ensureAudioContext();
    const bufferSize = ctx.sampleRate * 2;
    const output = new Float32Array(bufferSize);
    if (type === 'white') {
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969   * b2 + w * 0.153852;
        b3 = 0.8665  * b3 + w * 0.3104856;
        b4 = 0.55    * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        output[i] = 0.11 * (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362);
        b6 = w * 0.115926;
      }
    } else {
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const w = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * w) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }
    }
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    buffer.copyToChannel(output, 0);
    return buffer;
  }, [ensureAudioContext]);

  // ─── Ambient sounds ───────────────────────────────────────────────────────
  const stopAmbientSound = useCallback((id: AmbientSoundId) => {
    const node = ambientNodesRef.current.get(id);
    if (!node) return;
    const { source, gain } = node;
    ambientNodesRef.current.delete(id);
    const ctx = audioCtxRef.current;
    if (isPlayingRef.current && ctx) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.04);
      try { source.stop(now + 0.04); } catch { /* already ended */ }
    } else {
      try { source.stop(); } catch { /* already ended */ }
    }
    try { source.disconnect(); } catch { /* best effort */ }
    try { gain.disconnect(); } catch { /* best effort */ }
  }, []);

  const startAmbientSound = useCallback(async (id: AmbientSoundId) => {
    if (ambientNodesRef.current.has(id)) return;
    const ctx = ensureAudioContext();
    let buffer = ambientBuffersRef.current.get(id);
    if (!buffer) {
      if (NOISE_IDS.has(id)) {
        buffer = createNoiseBuffer(id as 'white' | 'pink' | 'brown');
        ambientBuffersRef.current.set(id, buffer);
      } else {
        const entry = NATURE_SOUNDS.find((s) => s.id === id);
        if (!entry?.asset) return;
        buffer = await ctx.decodeAudioData(entry.asset);
        ambientBuffersRef.current.set(id, buffer);
      }
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(AMBIENT_VOLUME * ambientVolumeRef.current, ctx.currentTime + 0.05);
    gain.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();
    ambientNodesRef.current.set(id, { source, gain });
  }, [createNoiseBuffer, ensureAudioContext]);

  const toggleAmbientSound = useCallback(async (id: AmbientSoundId) => {
    triggerHaptic();
    const isActive = activeAmbientSoundsRef.current.has(id);
    if (isActive) {
      stopAmbientSound(id);
      setActiveAmbientSounds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      setActiveAmbientSounds((prev) => new Set([...prev, id]));
      if (isPlayingRef.current) await startAmbientSound(id);
    }
  }, [startAmbientSound, stopAmbientSound]);

  // ─── Engine lifecycle ─────────────────────────────────────────────────────
  const closeAudioEngine = useCallback(() => {
    stopAffirmationSource();
    stopBowlSource();
    for (const { source, gain } of ambientNodesRef.current.values()) {
      try { source.stop(); } catch { /* already ended */ }
      try { source.disconnect(); } catch { /* best effort */ }
      try { gain.disconnect(); } catch { /* best effort */ }
    }
    ambientNodesRef.current.clear();
    ambientBuffersRef.current.clear();
    pureOscRef.current = null;
    leftOscRef.current = null;
    rightOscRef.current = null;
    bowlGainRef.current = null;
    affirmationGainRef.current = null;
    binauralGainRef.current = null;
    bowlBufferRef.current = null;
    affirmationBuffersRef.current.clear();
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, [stopAffirmationSource, stopBowlSource]);

  const pauseAudioEngine = useCallback(() => {
    audioCtxRef.current?.suspend();
  }, []);

  // ─── Oscillators ──────────────────────────────────────────────────────────
  const startPure = useCallback(() => {
    if (!shouldPlayPure || pureOscRef.current) return;
    const ctx = ensureAudioContext();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = parseFloat(selectedFrequency);
    osc.connect(binauralGainRef.current ?? ctx.destination);
    osc.start();
    pureOscRef.current = osc;
  }, [ensureAudioContext, selectedFrequency, shouldPlayPure]);

  const startBinaural = useCallback(() => {
    if (!shouldPlayBrainwave || leftOscRef.current || rightOscRef.current) return;
    const beat = BINAURAL_BEATS[selectedBrainwave] ?? BINAURAL_BEATS.alpha;
    const ctx = ensureAudioContext();
    const leftOsc = ctx.createOscillator();
    const rightOsc = ctx.createOscillator();
    const leftPan = ctx.createStereoPanner();
    const rightPan = ctx.createStereoPanner();
    leftPan.pan.value = -1;
    rightPan.pan.value = 1;
    leftOsc.frequency.value = BINAURAL_CARRIER - beat / 2;
    rightOsc.frequency.value = BINAURAL_CARRIER + beat / 2;
    leftOsc.connect(leftPan);
    rightOsc.connect(rightPan);
    leftPan.connect(binauralGainRef.current ?? ctx.destination);
    rightPan.connect(binauralGainRef.current ?? ctx.destination);
    leftOsc.start();
    rightOsc.start();
    leftOscRef.current = leftOsc;
    rightOscRef.current = rightOsc;
  }, [ensureAudioContext, selectedBrainwave, shouldPlayBrainwave]);

  // ─── Playback ─────────────────────────────────────────────────────────────
  const startBowlPlayback = useCallback(async () => {
    if (!shouldPlaySingingBowl) return false;
    if (bowlSourceRef.current) return true;
    const ctx = ensureAudioContext();
    const buffer = await loadBowlBuffer();
    const gain = bowlGainRef.current;
    if (!gain) return false;
    const targetVolume = isBowlMuted ? 0 : BOWL_VOLUME;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(targetVolume, ctx.currentTime + 0.05);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();
    bowlSourceRef.current = source;
    return true;
  }, [ensureAudioContext, isBowlMuted, loadBowlBuffer, shouldPlaySingingBowl]);

  const startAffirmationPlayback = useCallback(async function playAffirmation(targetIndex: number) {
    const items = recordingsRef.current;
    if (items.length === 0) return false;
    const normalizedIndex = ((targetIndex % items.length) + items.length) % items.length;
    const target = items[normalizedIndex];
    if (!target) return false;
    clearNextTrackTimer();
    stopAffirmationSource();
    const ctx = ensureAudioContext();
    const buffer = await loadAffirmationBuffer(target);
    const gain = affirmationGainRef.current;
    if (!gain) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onEnded = () => {
      if (affirmationSourceRef.current !== source) return;
      affirmationSourceRef.current = null;
      source.onEnded = null;
      try { source.disconnect(); } catch { /* best effort */ }
      if (!isPlayingRef.current || recordingsRef.current.length === 0) return;
      clearNextTrackTimer();
      nextTrackTimerRef.current = setTimeout(() => {
        void (async () => {
          if (!isPlayingRef.current || recordingsRef.current.length === 0) return;
          const nextIndex = (currentTrackIndexRef.current + 1) % recordingsRef.current.length;
          if (nextIndex === 0) setCompletedSetCount((count) => count + 1);
          setTrackIndex(nextIndex);
          await audioCtxRef.current?.resume();
          await playAffirmation(nextIndex);
        })();
      }, TRACK_GAP_MS);
    };
    source.start();
    affirmationSourceRef.current = source;
    setTrackIndex(normalizedIndex);
    return true;
  }, [clearNextTrackTimer, ensureAudioContext, loadAffirmationBuffer, stopAffirmationSource]);

  // ─── Mute toggles ─────────────────────────────────────────────────────────
  const toggleBowlMute = useCallback(() => {
    triggerHaptic();
    if (!shouldPlaySingingBowl) return;
    setIsBowlMuted((current) => {
      const next = !current;
      if (bowlGainRef.current) bowlGainRef.current.gain.value = next ? 0 : BOWL_VOLUME;
      return next;
    });
  }, [shouldPlaySingingBowl]);

  const toggleOscMute = useCallback(() => {
    triggerHaptic();
    const next = !isOscMutedRef.current;
    isOscMutedRef.current = next;
    setIsOscMuted(next);
    if (binauralGainRef.current) binauralGainRef.current.gain.value = next ? 0 : OSC_VOLUME;
  }, []);

  // ─── Volume ───────────────────────────────────────────────────────────────
  const updateVolume = useCallback((progress: number) => {
    const clamped = Math.max(1, Math.min(100, Math.round(progress * 100)));
    const nextGain = affirmationPercentToGain(clamped);
    setVolume(clamped);
    affirmationVolumeRef.current = nextGain;
    if (affirmationGainRef.current) affirmationGainRef.current.gain.value = nextGain;
  }, []);

  const updateAmbientVolume = useCallback((progress: number) => {
    const clamped = Math.max(0, Math.min(1, progress));
    ambientVolumeRef.current = clamped;
    setAmbientVolume(clamped);
    const ctx = audioCtxRef.current;
    const target = AMBIENT_VOLUME * clamped;
    for (const { gain } of ambientNodesRef.current.values()) {
      if (ctx) {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(target, now);
      } else {
        gain.gain.value = target;
      }
    }
  }, []);

  // ─── Session handlers ─────────────────────────────────────────────────────
  const handlePlayToggle = useCallback(async () => {
    if (isPlaying) {
      clearNextTrackTimer();
      pauseAudioEngine();
      pauseSessionTimer();
      setIsPlaying(false);
      isPlayingRef.current = false;
      return;
    }
    await ensureAudioSession();
    await ensureAudioContext().resume();
    if (shouldPlaySingingBowl) await startBowlPlayback();
    if (shouldPlayBrainwave) startBinaural();
    else if (shouldPlayPure) startPure();
    if (!affirmationSourceRef.current && recordingsRef.current.length > 0) {
      await startAffirmationPlayback(currentTrackIndexRef.current);
    }
    for (const id of activeAmbientSoundsRef.current) {
      if (!ambientNodesRef.current.has(id)) await startAmbientSound(id);
    }
    startSessionTimer();
    setIsPlaying(true);
    isPlayingRef.current = true;
  }, [
    isPlaying, clearNextTrackTimer, pauseAudioEngine, pauseSessionTimer,
    ensureAudioSession, ensureAudioContext, shouldPlaySingingBowl, shouldPlayBrainwave,
    shouldPlayPure, startBowlPlayback, startBinaural, startPure,
    startAffirmationPlayback, startAmbientSound, startSessionTimer,
  ]);

  const stopSession = useCallback(() => {
    clearNextTrackTimer();
    pauseSessionTimer();
    isPlayingRef.current = false;
    setIsPlaying(false);
    closeAudioEngine();
  }, [clearNextTrackTimer, closeAudioEngine, pauseSessionTimer]);

  // ─── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { activeAmbientSoundsRef.current = activeAmbientSounds; }, [activeAmbientSounds]);

  useEffect(() => {
    recordingsRef.current = recordings;
    if (recordings.length === 0) {
      setTrackIndex(0);
      stopAffirmationSource();
      clearNextTrackTimer();
      return;
    }
    if (currentTrackIndexRef.current >= recordings.length) setTrackIndex(0);
  }, [clearNextTrackTimer, recordings, stopAffirmationSource]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const entries = await getSavedRecordings();
      if (!mounted) return;
      recordingsRef.current = entries;
      setRecordings(entries);
    };
    void load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!isPlaying || recordings.length === 0 || affirmationSourceRef.current) return;
    const start = async () => {
      await ensureAudioSession();
      await ensureAudioContext().resume();
      await startAffirmationPlayback(currentTrackIndexRef.current);
    };
    void start();
  }, [ensureAudioContext, ensureAudioSession, isPlaying, recordings, startAffirmationPlayback]);

  useEffect(() => {
    return () => {
      clearNextTrackTimer();
      clearSessionTimer();
      closeAudioEngine();
    };
  }, [clearNextTrackTimer, clearSessionTimer, closeAudioEngine]);

  useEffect(() => {
    bowlBufferRef.current = null;
    if (!bowlSourceRef.current) return;
    stopBowlSource();
    if (isPlayingRef.current && shouldPlaySingingBowl) void startBowlPlayback();
  }, [selectedBowlAudio, shouldPlaySingingBowl, startBowlPlayback, stopBowlSource]);

  return {
    isPlaying,
    isBowlMuted,
    isOscMuted,
    activeAmbientSounds,
    volume,
    recordings,
    currentTrackIndex,
    completedSetCount,
    sessionElapsedMs,
    handlePlayToggle,
    stopSession,
    toggleBowlMute,
    toggleOscMute,
    toggleAmbientSound,
    updateVolume,
    ambientVolume,
    updateAmbientVolume,
  };
}
