import { useRef, useCallback, useEffect } from 'react';
import { createAudioPlayer } from './expo-audio';
import type { AudioPlayer } from './expo-audio';
import { AudioContext } from './audio-api-core';
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
const FADE_MS = 400;
const TOTAL_MS = 2000;

export function useFrequencyPreview() {
  const playerRef = useRef<AudioPlayer | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playingKeyRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const p = playerRef.current;
    if (p) {
      try { p.stop(); } catch {}
      try { p.remove(); } catch {}
      playerRef.current = null;
    }

    const ctx = audioCtxRef.current;
    if (ctx) {
      try { ctx.close(); } catch {}
      audioCtxRef.current = null;
    }
    playingKeyRef.current = null;
  }, []);

  /** Play bowl MP3 via expo-audio with JS-stepped volume fade */
  const _playBowl = useCallback((freqId: string) => {
    const asset = BOWL_ASSETS[freqId];
    if (!asset) return;
    const player = createAudioPlayer(asset);
    playerRef.current = player;
    (player as any).volume = 0;
    player.play();

    const stepMs = FADE_MS / FADE_STEPS;
    for (let i = 1; i <= FADE_STEPS; i++) {
      timersRef.current.push(
        setTimeout(() => {
          if (playerRef.current === player) (player as any).volume = i / FADE_STEPS;
        }, i * stepMs)
      );
    }
    const fadeOutStart = TOTAL_MS - FADE_MS;
    for (let i = 1; i <= FADE_STEPS; i++) {
      timersRef.current.push(
        setTimeout(() => {
          if (playerRef.current === player) (player as any).volume = 1 - i / FADE_STEPS;
        }, fadeOutStart + i * stepMs)
      );
    }
    timersRef.current.push(
      setTimeout(() => {
        if (playerRef.current === player) {
          try { player.stop(); } catch {}
          try { player.remove(); } catch {}
          playerRef.current = null;
        }
      }, TOTAL_MS + 50)
    );
  }, []);

  /** Play a pure sine oscillator at `hz` with AudioContext-scheduled gain envelope */
  const _playPure = useCallback((hz: number) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const now = ctx.currentTime;
    const fadeS = FADE_MS / 1000;
    const totalS = TOTAL_MS / 1000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + fadeS);
    gain.gain.setValueAtTime(0.5, now + totalS - fadeS);
    gain.gain.linearRampToValueAtTime(0, now + totalS);
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + totalS + 0.05);

    timersRef.current.push(
      setTimeout(() => {
        if (audioCtxRef.current === ctx) {
          try { ctx.close(); } catch {}
          audioCtxRef.current = null;
        }
      }, TOTAL_MS + 200)
    );
  }, []);

  /** Play binaural beat using two panned oscillators */
  const _playBinaural = useCallback((beat: number) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const now = ctx.currentTime;
    const fadeS = FADE_MS / 1000;
    const totalS = TOTAL_MS / 1000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + fadeS);
    gain.gain.setValueAtTime(0.5, now + totalS - fadeS);
    gain.gain.linearRampToValueAtTime(0, now + totalS);
    gain.connect(ctx.destination);

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

    timersRef.current.push(
      setTimeout(() => {
        if (audioCtxRef.current === ctx) {
          try { ctx.close(); } catch {}
          audioCtxRef.current = null;
        }
      }, TOTAL_MS + 200)
    );
  }, []);

  /**
   * Preview a solfeggio frequency card.
   * bg = 'Singing Bowl' → play the bowl MP3
   * bg = 'Pure'         → synthesize a pure sine at that Hz
   * bg = 'Brainwaves'   → no preview (brainwave grid is shown instead)
   */
  const previewFrequency = useCallback((freqId: string, bg: string) => {
    const key = `${bg}:${freqId}`;
    if (playingKeyRef.current === key) return;
    cleanup();
    playingKeyRef.current = key;
    if (bg === 'Singing Bowl') {
      _playBowl(freqId);
    } else if (bg === 'Pure') {
      const hz = parseFloat(freqId);
      if (!isNaN(hz)) _playPure(hz);
    }
  }, [cleanup, _playBowl, _playPure]);

  /** Preview a brainwave card — plays a 2-second binaural beat sample */
  const previewBrainwave = useCallback((brainwaveId: string) => {
    const key = `brainwave:${brainwaveId}`;
    if (playingKeyRef.current === key) return;
    cleanup();
    playingKeyRef.current = key;
    const beat = BINAURAL_BEATS[brainwaveId];
    if (beat != null) _playBinaural(beat);
  }, [cleanup, _playBinaural]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { previewFrequency, previewBrainwave };
}
