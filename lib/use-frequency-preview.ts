import { useRef, useCallback, useEffect } from 'react';
import { createAudioPlayer } from './expo-audio';
import type { AudioPlayer } from './expo-audio';
import { AudioContext } from './audio-api-core';
import { configureMixedPlaybackAsync } from './audio-playback';
import { BINAURAL_BEATS, BINAURAL_CARRIER } from '../app/session/playback-constants';

type PreviewGain = ReturnType<InstanceType<typeof AudioContext>['createGain']>;

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

// ─── Engine state ──────────────────────────────────────────────────────────────
// Exactly one "engine" owns the iOS AVAudioSession at any time:
//   - 'bowl' → expo-audio players (mp3 samples)
//   - 'osc'  → rn-audio-api AudioContext (pure / binaural oscillators)
//   - 'idle' → nothing playing, no resources allocated
// Switching engines requires fully tearing down the previous engine BEFORE the
// new one starts, otherwise on iOS the two fight over the audio session and the
// previous sound keeps playing while the new one is silent.
type Engine = 'idle' | 'bowl' | 'osc';
let engine: Engine = 'idle';

// Bumped on every state-changing event. Async continuations capture their
// `runId` at kick-off and bail if it no longer matches.
let runId = 0;

// ─── Bowl (expo-audio) state ───────────────────────────────────────────────────
let bowlPlayers: Map<string, AudioPlayer> | null = null;
let audioModeConfigured = false;
let currentBowlId: string | null = null;
// Timers live in two pools: "active" (fade-in/hold/fade-out of the current
// preview) and "outgoing" (fade-out of a displaced bowl during crossfade).
// Outgoing timers survive a run-id bump so the crossfade tail keeps going.
let bowlActiveTimers: ReturnType<typeof setTimeout>[] = [];
let bowlOutgoingTimers: ReturnType<typeof setTimeout>[] = [];

const clearBowlActiveTimers = () => {
  bowlActiveTimers.forEach(clearTimeout);
  bowlActiveTimers = [];
};
const clearBowlOutgoingTimers = () => {
  bowlOutgoingTimers.forEach(clearTimeout);
  bowlOutgoingTimers = [];
};

const silencePlayer = (p: AudioPlayer) => {
  // Belt-and-suspenders: on iOS, pause() alone can be ignored if the player
  // just started, and remove() may not stop the native AVPlayer synchronously
  // if any JS reference is still held. Stack all silencing options.
  try { (p as any).volume = 0; } catch { /* best effort */ }
  try { (p as any).muted = true; } catch { /* best effort */ }
  try { p.pause(); } catch { /* best effort */ }
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

const silenceAllBowlsExcept = (exceptId: string | null) => {
  if (!bowlPlayers) return;
  for (const [id, p] of bowlPlayers.entries()) {
    if (id === exceptId) continue;
    silencePlayer(p);
  }
};

/** Fully tear down the bowl engine. Destroys all cached players so that the
 *  native AVAudioSession they hold is released — otherwise rn-audio-api's
 *  AudioContext can't claim the session and oscillators stay silent. */
const teardownBowlEngine = () => {
  clearBowlActiveTimers();
  clearBowlOutgoingTimers();
  currentBowlId = null;
  if (!bowlPlayers) {
    audioModeConfigured = false;
    return;
  }
  for (const p of bowlPlayers.values()) {
    silencePlayer(p);
    try { p.remove(); } catch { /* best effort */ }
  }
  bowlPlayers = null;
  audioModeConfigured = false;
};

// ─── Oscillator (rn-audio-api) state ───────────────────────────────────────────
let oscCtx: AudioContext | null = null;
let oscFadeGain: PreviewGain | null = null;
let oscActiveNodes: Array<{ stop(when?: number): void }> = [];
let oscCleanupTimer: ReturnType<typeof setTimeout> | null = null;

const clearOscCleanupTimer = () => {
  if (oscCleanupTimer) { clearTimeout(oscCleanupTimer); oscCleanupTimer = null; }
};

const ensureOscCtx = (): AudioContext => {
  if (!oscCtx) oscCtx = new AudioContext();
  return oscCtx;
};

/** Fade the current oscillator output to 0 and stop its nodes. Keeps the
 *  AudioContext alive so the next osc preview starts without a creation gap. */
const fadeOutOscNodes = (fadeDuration = 0.05) => {
  if (oscCtx && oscFadeGain) {
    const now = oscCtx.currentTime;
    try {
      oscFadeGain.gain.cancelScheduledValues(now);
      oscFadeGain.gain.setValueAtTime(oscFadeGain.gain.value, now);
      oscFadeGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
    } catch { /* best effort */ }
  }
  const stopAt = (oscCtx?.currentTime ?? 0) + fadeDuration + 0.01;
  oscActiveNodes.forEach(n => { try { n.stop(stopAt); } catch { /* best effort */ } });
  oscActiveNodes = [];
  oscFadeGain = null;
};

/** Fully tear down the osc engine. Closes the AudioContext so the iOS audio
 *  session is released and expo-audio can take over cleanly. */
const teardownOscEngine = () => {
  clearOscCleanupTimer();
  fadeOutOscNodes(0.05);
  if (oscCtx) {
    try { oscCtx.close(); } catch { /* best effort */ }
    oscCtx = null;
  }
  oscFadeGain = null;
  oscActiveNodes = [];
};

// ─── Engine switching ──────────────────────────────────────────────────────────
/** Ensure the requested engine is the active one. If a different engine is
 *  currently active it is FULLY torn down first so there's no audio-session
 *  contention on iOS. Returns after teardown completes (synchronous here). */
const switchToEngine = (target: Engine) => {
  if (engine === target) return;
  if (engine === 'bowl' && target !== 'bowl') teardownBowlEngine();
  if (engine === 'osc' && target !== 'osc') teardownOscEngine();
  engine = target;
};

// ─── Preview controller (owner + key bookkeeping) ──────────────────────────────
const previewController = {
  playingKey: null as string | null,
  ownerId: null as number | null,
};

let nextOwnerId = 1;

const scheduleBowlActive = (expectedRunId: number, cb: () => void, delayMs: number) => {
  bowlActiveTimers.push(
    setTimeout(() => {
      if (runId !== expectedRunId) return;
      cb();
    }, delayMs)
  );
};

// ─── Public teardown ───────────────────────────────────────────────────────────
const hardStop = (ownerId?: number) => {
  if (
    ownerId != null &&
    previewController.ownerId != null &&
    previewController.ownerId !== ownerId
  ) return;
  runId += 1;
  teardownBowlEngine();
  teardownOscEngine();
  engine = 'idle';
  previewController.playingKey = null;
  previewController.ownerId = null;
};

/** Stop the currently-playing preview. Called when the user changes the
 *  background. Bowl is killed IMMEDIATELY (pause + muted + remove) — no fade,
 *  no lingering tail — so the audio session is clean before the user taps a
 *  new preview. Osc is faded out over FADE_MS for a smoother transition since
 *  it doesn't suffer from the same session-hogging issue. */
const softStop = (ownerId?: number) => {
  if (
    ownerId != null &&
    previewController.ownerId != null &&
    previewController.ownerId !== ownerId
  ) return;

  const activeEngine = engine;
  runId += 1;
  clearBowlActiveTimers();
  clearOscCleanupTimer();

  if (activeEngine === 'bowl') {
    teardownBowlEngine();
    engine = 'idle';
  } else if (activeEngine === 'osc') {
    fadeOutOscNodes(FADE_MS / 1000);
    oscCleanupTimer = setTimeout(() => {
      oscFadeGain = null;
      oscActiveNodes = [];
      if (engine === 'osc') engine = 'idle';
    }, FADE_MS + 50);
  } else {
    engine = 'idle';
  }

  previewController.playingKey = null;
  previewController.ownerId = null;
};

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useFrequencyPreview() {
  const ownerIdRef = useRef<number | null>(null);
  if (ownerIdRef.current == null) ownerIdRef.current = nextOwnerId++;

  const cleanup = useCallback(() => { hardStop(ownerIdRef.current ?? undefined); }, []);
  const fadeOutPreview = useCallback(() => { softStop(ownerIdRef.current ?? undefined); }, []);

  // ── Bowl ────────────────────────────────────────────────────────────────────
  const _playBowl = useCallback(async (freqId: string, key: string) => {
    // Engine switch: if osc was active, tear it down fully (closes AudioContext)
    // so expo-audio can own the iOS session.
    switchToEngine('bowl');

    if (!audioModeConfigured) {
      try { await configureMixedPlaybackAsync(); audioModeConfigured = true; } catch { /* best effort */ }
    }

    // Crossfade from previous bowl (if any) using the outgoing timer pool so a
    // subsequent run-id bump doesn't cancel the tail.
    clearBowlOutgoingTimers();
    const prevBowlId = currentBowlId;
    if (prevBowlId !== null && prevBowlId !== freqId && bowlPlayers?.has(prevBowlId)) {
      const outgoing = bowlPlayers.get(prevBowlId)!;
      const startVol = Math.max(0.001, Math.min(1, (outgoing as any).volume ?? 1));
      const stepMs = FADE_MS / FADE_STEPS;
      for (let i = 1; i <= FADE_STEPS; i++) {
        const ii = i;
        bowlOutgoingTimers.push(setTimeout(() => {
          try { (outgoing as any).volume = startVol * (1 - ii / FADE_STEPS); } catch { /* best effort */ }
        }, ii * stepMs));
      }
      bowlOutgoingTimers.push(setTimeout(() => {
        silencePlayer(outgoing);
      }, FADE_MS + 50));
      silenceAllBowlsExcept(prevBowlId);
    } else {
      silenceAllBowlsExcept(freqId);
    }
    currentBowlId = freqId;

    clearBowlActiveTimers();
    runId += 1;
    const myRun = runId;
    previewController.ownerId = ownerIdRef.current;
    previewController.playingKey = key;

    const player = getBowlPlayers().get(freqId);
    if (!player) return;

    (player as any).volume = 0;
    try { (player as any).muted = false; } catch { /* best effort */ }
    await player.seekTo(0).catch(() => {});
    if (runId !== myRun || engine !== 'bowl') return;

    player.play();

    const stepMs = FADE_MS / FADE_STEPS;
    for (let i = 1; i <= FADE_STEPS; i++) {
      scheduleBowlActive(myRun, () => { (player as any).volume = i / FADE_STEPS; }, i * stepMs);
    }
    const fadeOutStart = TOTAL_MS - FADE_MS;
    for (let i = 1; i <= FADE_STEPS; i++) {
      scheduleBowlActive(myRun, () => { (player as any).volume = 1 - i / FADE_STEPS; }, fadeOutStart + i * stepMs);
    }
    scheduleBowlActive(myRun, () => {
      silencePlayer(player);
      clearBowlActiveTimers();
      previewController.playingKey = null;
      previewController.ownerId = null;
      currentBowlId = null;
    }, TOTAL_MS + 50);
  }, []);

  // ── Pure sine ──────────────────────────────────────────────────────────────
  const _playPure = useCallback(async (hz: number, key: string) => {
    switchToEngine('osc');
    clearOscCleanupTimer();
    fadeOutOscNodes(FADE_MS / 1000);
    runId += 1;
    const myRun = runId;
    previewController.ownerId = ownerIdRef.current;
    previewController.playingKey = key;

    const ctx = ensureOscCtx();
    try { await ctx.resume(); } catch { /* best effort */ }
    if (runId !== myRun || engine !== 'osc') return;

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

    clearOscCleanupTimer();
    oscCleanupTimer = setTimeout(() => {
      if (runId !== myRun) return;
      oscFadeGain = null;
      oscActiveNodes = [];
      previewController.playingKey = null;
      previewController.ownerId = null;
    }, TOTAL_MS + 200);
  }, []);

  // ── Binaural beat ──────────────────────────────────────────────────────────
  const _playBinaural = useCallback(async (beat: number, key: string) => {
    switchToEngine('osc');
    clearOscCleanupTimer();
    fadeOutOscNodes(FADE_MS / 1000);
    runId += 1;
    const myRun = runId;
    previewController.ownerId = ownerIdRef.current;
    previewController.playingKey = key;

    const ctx = ensureOscCtx();
    try { await ctx.resume(); } catch { /* best effort */ }
    if (runId !== myRun || engine !== 'osc') return;

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

    clearOscCleanupTimer();
    oscCleanupTimer = setTimeout(() => {
      if (runId !== myRun) return;
      oscFadeGain = null;
      oscActiveNodes = [];
      previewController.playingKey = null;
      previewController.ownerId = null;
    }, TOTAL_MS + 200);
  }, []);

  // ── Public API ─────────────────────────────────────────────────────────────
  const previewFrequency = useCallback((freqId: string, bg: string) => {
    const key = `${bg}:${freqId}`;
    if (previewController.playingKey === key && engine !== 'idle') return;
    if (bg === 'Singing Bowl') {
      void _playBowl(freqId, key);
    } else if (bg === 'Pure') {
      const hz = parseFloat(freqId);
      if (!isNaN(hz)) void _playPure(hz, key);
    }
  }, [_playBowl, _playPure]);

  const previewBrainwave = useCallback((brainwaveId: string) => {
    const key = `brainwave:${brainwaveId}`;
    if (previewController.playingKey === key && engine !== 'idle') return;
    const beat = BINAURAL_BEATS[brainwaveId];
    if (beat != null) void _playBinaural(beat, key);
  }, [_playBinaural]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { previewFrequency, previewBrainwave, stopPreview: cleanup, fadeOutPreview };
}
