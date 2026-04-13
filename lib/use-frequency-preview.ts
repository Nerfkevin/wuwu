import { useRef, useCallback, useEffect } from 'react';
import { createAudioPlayer } from './expo-audio';
import type { AudioPlayer } from './expo-audio';
import { AudioContext } from './audio-api-core';
import { configureMixedPlaybackAsync } from './audio-playback';
import { BINAURAL_BEATS, BINAURAL_CARRIER } from '../app/session/playback-constants';

const BOWL_ASSETS: Record<string, any> = {
  '174': require('../assets/images/bowl/174bowl.mp3'),
  '285': require('../assets/images/bowl/285bowl.mp3'),
  '396': require('../assets/images/bowl/396bowl.mp3'),
  '417': require('../assets/images/bowl/417bowl.mp3'),
  '528': require('../assets/images/bowl/528bowl.mp3'),
  '639': require('../assets/images/bowl/639bowl.mp3'),
  '741': require('../assets/images/bowl/741bowl.mp3'),
  '852': require('../assets/images/bowl/852bowl.mp3'),
  '963': require('../assets/images/bowl/963bowl.mp3'),
};

const FADE_STEPS = 20;
const FADE_MS = 750;
const TOTAL_MS = 3000;

// ─── Preloaded bowl players ────────────────────────────────────────────────────
// Created once (lazily on first tap) and kept alive for the app lifetime so
// switching between bowls is synchronous — no reload gap.
let bowlPlayers: Map<string, AudioPlayer> | null = null;
let audioModeConfigured = false;

// ─── Persistent oscillator AudioContext ────────────────────────────────────────
// Never closed between preview switches — avoids the native context creation gap.
let oscCtx: AudioContext | null = null;
let oscFadeGain: GainNode | null = null;
let oscActiveNodes: Array<{ stop(when?: number): void }> = [];

const ensureOscCtx = (): AudioContext => {
  if (!oscCtx) {
    oscCtx = new AudioContext();
  }
  return oscCtx;
};

// fadeDuration: seconds. Default 0.05 for quick cleanup; pass FADE_MS/1000 for crossfade.
const cutoverOscAudio = (fadeDuration = 0.05) => {
  if (oscCtx && oscFadeGain) {
    const now = oscCtx.currentTime;
    oscFadeGain.gain.cancelScheduledValues(now);
    oscFadeGain.gain.setValueAtTime(oscFadeGain.gain.value, now);
    oscFadeGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
  }
  const stopAt = (oscCtx?.currentTime ?? 0) + fadeDuration + 0.01;
  oscActiveNodes.forEach(n => { try { n.stop(stopAt); } catch { /* best effort */ } });
  oscActiveNodes = [];
  oscFadeGain = null;
};

// ─── Bowl crossfade state ──────────────────────────────────────────────────────
// Separate timer array so clearPreviewTimers() doesn't cancel an outgoing fade.
let currentlyPlayingBowlId: string | null = null;
let crossfadeOutTimers: ReturnType<typeof setTimeout>[] = [];

const clearCrossfadeOutTimers = () => {
  crossfadeOutTimers.forEach(clearTimeout);
  crossfadeOutTimers = [];
};

const stopAllBowlPlayersExcept = (exceptId: string) => {
  if (!bowlPlayers) return;
  for (const [id, p] of bowlPlayers.entries()) {
    if (id === exceptId) continue;
    try { p.stop(); } catch { /* best effort */ }
    try { (p as any).volume = 0; } catch { /* best effort */ }
  }
};

const releaseOscCtx = () => {
  cutoverOscAudio();
  if (oscCtx) {
    try { oscCtx.close(); } catch { /* best effort */ }
    oscCtx = null;
  }
};

const getBowlPlayers = (): Map<string, AudioPlayer> => {
  if (!bowlPlayers) {
    bowlPlayers = new Map();
    for (const [freqId, asset] of Object.entries(BOWL_ASSETS)) {
      try {
        bowlPlayers.set(freqId, createAudioPlayer(asset));
      } catch { /* best effort */ }
    }
  }
  return bowlPlayers;
};

const stopAllBowlPlayers = () => {
  if (!bowlPlayers) return;
  for (const p of bowlPlayers.values()) {
    try { p.stop(); } catch { /* best effort */ }
    try { (p as any).volume = 0; } catch { /* best effort */ }
  }
};

// Fully destroy all players and reset the cache so the next AudioContext creation
// (react-native-audio-api) does not conflict with live expo-audio sessions.
const releaseAllBowlPlayers = () => {
  if (!bowlPlayers) return;
  for (const p of bowlPlayers.values()) {
    try { p.stop(); } catch { /* best effort */ }
    try { p.remove(); } catch { /* best effort */ }
  }
  bowlPlayers = null;
  audioModeConfigured = false;
};

// ─── Preview controller ────────────────────────────────────────────────────────
const previewController = {
  audioCtx: null as AudioContext | null,
  timers: [] as ReturnType<typeof setTimeout>[],
  playingKey: null as string | null,
  ownerId: null as number | null,
  runId: 0,
};

let nextOwnerId = 1;

const clearPreviewTimers = () => {
  previewController.timers.forEach(clearTimeout);
  previewController.timers = [];
};

const releasePreviewAudioContext = (audioCtx: AudioContext | null) => {
  if (!audioCtx) return;
  try { audioCtx.close(); } catch { /* best effort */ }
};

const stopManagedPreview = (ownerId?: number, releaseOsc = true) => {
  // Only skip if another hook instance owns the active preview.
  // Allow cleanup when nothing is playing (ownerId === null) so BG-switch
  // always tears down audio even if the previous preview already expired.
  if (
    ownerId != null &&
    previewController.ownerId != null &&
    previewController.ownerId !== ownerId
  ) return;

  previewController.runId += 1;
  clearPreviewTimers();
  clearCrossfadeOutTimers();
  currentlyPlayingBowlId = null;
  releaseAllBowlPlayers();
  releasePreviewAudioContext(previewController.audioCtx);
  previewController.audioCtx = null;
  previewController.playingKey = null;
  previewController.ownerId = null;
  if (releaseOsc) releaseOscCtx();
};

/** Fade out current preview over FADE_MS (bowl + oscillator). Keeps osc AudioContext open for next tap. */
const fadeOutManagedPreview = (ownerId?: number) => {
  if (
    ownerId != null &&
    previewController.ownerId != null &&
    previewController.ownerId !== ownerId
  ) return;

  const hasSomething =
    previewController.playingKey != null ||
    currentlyPlayingBowlId != null ||
    oscFadeGain != null;
  if (!hasSomething) return;

  previewController.runId += 1;
  clearPreviewTimers();
  clearCrossfadeOutTimers();

  const bowlId = currentlyPlayingBowlId;
  if (bowlId && bowlPlayers?.has(bowlId)) {
    stopAllBowlPlayersExcept(bowlId);
    const outgoing = bowlPlayers.get(bowlId)!;
    const startVol = Math.max(0.001, Math.min(1, (outgoing as any).volume ?? 1));
    const stepMs = FADE_MS / FADE_STEPS;
    for (let i = 1; i <= FADE_STEPS; i++) {
      const ii = i;
      crossfadeOutTimers.push(setTimeout(() => {
        try { (outgoing as any).volume = startVol * (1 - ii / FADE_STEPS); } catch { /* best effort */ }
      }, ii * stepMs));
    }
    crossfadeOutTimers.push(setTimeout(() => {
      try { outgoing.pause(); } catch { /* best effort */ }
      try { (outgoing as any).volume = 0; } catch { /* best effort */ }
      currentlyPlayingBowlId = null;
    }, FADE_MS + 50));
  } else {
    currentlyPlayingBowlId = null;
  }

  cutoverOscAudio(FADE_MS / 1000);

  releasePreviewAudioContext(previewController.audioCtx);
  previewController.audioCtx = null;
  previewController.playingKey = null;
  previewController.ownerId = null;
};

const schedulePreviewTimer = (runId: number, cb: () => void, delayMs: number) => {
  previewController.timers.push(
    setTimeout(() => {
      if (previewController.runId !== runId) return;
      cb();
    }, delayMs)
  );
};

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useFrequencyPreview() {
  const ownerIdRef = useRef<number | null>(null);

  if (ownerIdRef.current == null) {
    ownerIdRef.current = nextOwnerId++;
  }

  const cleanup = useCallback(() => {
    stopManagedPreview(ownerIdRef.current ?? undefined);
  }, []);

  const fadeOutPreview = useCallback(() => {
    fadeOutManagedPreview(ownerIdRef.current ?? undefined);
  }, []);

  // ── Bowl (preloaded, crossfade switch) ──────────────────────────────────────
  const _playBowl = useCallback(async (freqId: string, key: string) => {
    // Configure audio session once at app level
    if (!audioModeConfigured) {
      try { await configureMixedPlaybackAsync(); audioModeConfigured = true; } catch { /* best effort */ }
    }

    // 1. Crossfade: fade out the outgoing bowl over FADE_MS; stop all others immediately.
    //    Uses a separate timer array so clearPreviewTimers() can't cancel the outgoing fade.
    clearCrossfadeOutTimers();
    const prevBowlId = currentlyPlayingBowlId;
    if (prevBowlId !== null && prevBowlId !== freqId && bowlPlayers?.has(prevBowlId)) {
      const outgoing = bowlPlayers.get(prevBowlId)!;
      const startVol = Math.max(0.001, Math.min(1, (outgoing as any).volume ?? 1));
      const stepMs = FADE_MS / FADE_STEPS;
      for (let i = 1; i <= FADE_STEPS; i++) {
        const ii = i;
        crossfadeOutTimers.push(setTimeout(() => {
          try { (outgoing as any).volume = startVol * (1 - ii / FADE_STEPS); } catch { /* best effort */ }
        }, ii * stepMs));
      }
      crossfadeOutTimers.push(setTimeout(() => {
        try { outgoing.pause(); } catch { /* best effort */ }
        try { (outgoing as any).volume = 0; } catch { /* best effort */ }
      }, FADE_MS + 50));
      stopAllBowlPlayersExcept(prevBowlId);
    } else {
      stopAllBowlPlayers();
    }
    currentlyPlayingBowlId = freqId;

    clearPreviewTimers();
    cutoverOscAudio();
    releasePreviewAudioContext(previewController.audioCtx);
    previewController.audioCtx = null;
    previewController.runId += 1;
    const runId = previewController.runId;
    previewController.ownerId = ownerIdRef.current;
    previewController.playingKey = key;

    // 2. Get the preloaded player and seek to start
    const player = getBowlPlayers().get(freqId);
    if (!player) return;

    (player as any).volume = 0;
    await player.seekTo(0).catch(() => {});

    // Bail if another bowl was tapped while seekTo was running
    if (previewController.runId !== runId) return;

    // 3. Play
    player.play();

    // Fade in
    const stepMs = FADE_MS / FADE_STEPS;
    for (let i = 1; i <= FADE_STEPS; i++) {
      schedulePreviewTimer(runId, () => { (player as any).volume = i / FADE_STEPS; }, i * stepMs);
    }
    // Fade out
    const fadeOutStart = TOTAL_MS - FADE_MS;
    for (let i = 1; i <= FADE_STEPS; i++) {
      schedulePreviewTimer(runId, () => { (player as any).volume = 1 - i / FADE_STEPS; }, fadeOutStart + i * stepMs);
    }
    // Cleanup at end
    schedulePreviewTimer(runId, () => {
      try { player.pause(); } catch { /* best effort */ }
      (player as any).volume = 0;
      clearPreviewTimers();
      previewController.playingKey = null;
      previewController.ownerId = null;
      currentlyPlayingBowlId = null;
    }, TOTAL_MS + 50);
  }, []);

  // ── Pure sine ────────────────────────────────────────────────────────────────
  const _playPure = useCallback(async (hz: number, key: string) => {
    // Stop bowls + clear timers, but keep the persistent oscCtx alive
    stopAllBowlPlayers();
    clearPreviewTimers();
    cutoverOscAudio(FADE_MS / 1000);
    previewController.runId += 1;
    const runId = previewController.runId;
    previewController.ownerId = ownerIdRef.current;
    previewController.playingKey = key;

    const ctx = ensureOscCtx();
    // Must await resume — on iOS the context auto-suspends after silence and
    // currentTime is frozen; scheduling against a stale time causes oscillators
    // to expire before they ever audibly play.
    try { await ctx.resume(); } catch { /* best effort */ }

    // Bail out if another tap arrived while we were waiting for resume
    if (previewController.runId !== runId) return;

    const now = ctx.currentTime;
    const fadeS = FADE_MS / 1000;
    const totalS = TOTAL_MS / 1000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + fadeS);
    gain.gain.setValueAtTime(0.5, now + totalS - fadeS);
    gain.gain.linearRampToValueAtTime(0, now + totalS);
    gain.connect(ctx.destination);
    oscFadeGain = gain;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + totalS + 0.05);
    oscActiveNodes = [osc];

    schedulePreviewTimer(runId, () => {
      if (previewController.runId !== runId) return;
      clearPreviewTimers();
      oscFadeGain = null;
      oscActiveNodes = [];
      previewController.playingKey = null;
      previewController.ownerId = null;
    }, TOTAL_MS + 200);
  }, []);

  // ── Binaural beat ────────────────────────────────────────────────────────────
  const _playBinaural = useCallback(async (beat: number, key: string) => {
    // Stop bowls + clear timers, but keep the persistent oscCtx alive
    stopAllBowlPlayers();
    clearPreviewTimers();
    cutoverOscAudio(FADE_MS / 1000);
    previewController.runId += 1;
    const runId = previewController.runId;
    previewController.ownerId = ownerIdRef.current;
    previewController.playingKey = key;

    const ctx = ensureOscCtx();
    // Must await resume — same reason as _playPure above
    try { await ctx.resume(); } catch { /* best effort */ }

    // Bail out if another tap arrived while we were waiting for resume
    if (previewController.runId !== runId) return;

    const now = ctx.currentTime;
    const fadeS = FADE_MS / 1000;
    const totalS = TOTAL_MS / 1000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + fadeS);
    gain.gain.setValueAtTime(0.5, now + totalS - fadeS);
    gain.gain.linearRampToValueAtTime(0, now + totalS);
    gain.connect(ctx.destination);
    oscFadeGain = gain;

    const leftPan = ctx.createStereoPanner();
    const rightPan = ctx.createStereoPanner();
    leftPan.pan.value = -1;
    rightPan.pan.value = 1;
    leftPan.connect(gain);
    rightPan.connect(gain);

    const leftOsc = ctx.createOscillator();
    leftOsc.type = 'sine';
    leftOsc.frequency.value = BINAURAL_CARRIER - beat / 2;
    leftOsc.connect(leftPan);
    leftOsc.start(now);
    leftOsc.stop(now + totalS + 0.05);

    const rightOsc = ctx.createOscillator();
    rightOsc.type = 'sine';
    rightOsc.frequency.value = BINAURAL_CARRIER + beat / 2;
    rightOsc.connect(rightPan);
    rightOsc.start(now);
    rightOsc.stop(now + totalS + 0.05);
    oscActiveNodes = [leftOsc, rightOsc];

    schedulePreviewTimer(runId, () => {
      if (previewController.runId !== runId) return;
      clearPreviewTimers();
      oscFadeGain = null;
      oscActiveNodes = [];
      previewController.playingKey = null;
      previewController.ownerId = null;
    }, TOTAL_MS + 200);
  }, []);

  // ── Public API ───────────────────────────────────────────────────────────────
  const previewFrequency = useCallback((freqId: string, bg: string) => {
    const key = `${bg}:${freqId}`;
    if (previewController.playingKey === key) return;
    if (bg === 'Singing Bowl') {
      void _playBowl(freqId, key);
    } else if (bg === 'Pure') {
      const hz = parseFloat(freqId);
      if (!isNaN(hz)) void _playPure(hz, key);
    }
  }, [_playBowl, _playPure]);

  const previewBrainwave = useCallback((brainwaveId: string) => {
    const key = `brainwave:${brainwaveId}`;
    if (previewController.playingKey === key) return;
    const beat = BINAURAL_BEATS[brainwaveId];
    if (beat != null) void _playBinaural(beat, key);
  }, [_playBinaural]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { previewFrequency, previewBrainwave, stopPreview: cleanup, fadeOutPreview };
}
