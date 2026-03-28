import { Dimensions } from 'react-native';
import { AudioContext } from '@/lib/audio-api-core';

export const { height } = Dimensions.get('window');

export const TRACK_GAP_MS = 5000;
export const BOWL_VOLUME = 0.5;
export const BINAURAL_CARRIER = 200;
export const OSC_VOLUME = 0.5;
export const AFFIRMATION_DEFAULT_VOLUME_PERCENT = 50;
export const AFFIRMATION_MAX_GAIN = 1;
export const AMBIENT_VOLUME = 0.45;

export const BINAURAL_BEATS: Record<string, number> = {
  delta: 2,
  theta: 6,
  alpha: 10,
  beta: 18,
  gamma: 40,
};

export const BOWL_AUDIO_BY_FREQUENCY: Record<string, number> = {
  '174': require('../../assets/images/bowl/174bowl.mp3'),
  '285': require('../../assets/images/bowl/285bowl.mp3'),
  '396': require('../../assets/images/bowl/396bowl.mp3'),
  '417': require('../../assets/images/bowl/417bowl.mp3'),
  '528': require('../../assets/images/bowl/528bowl.mp3'),
  '639': require('../../assets/images/bowl/639bowl.mp3'),
  '741': require('../../assets/images/bowl/741bowl.mp3'),
  '852': require('../../assets/images/bowl/852bowl.mp3'),
  '963': require('../../assets/images/bowl/963bowl.mp3'),
};

export const BRAINWAVE_LABELS: Record<string, string> = {
  delta: 'Delta · Sleep',
  theta: 'Theta · Meditate',
  alpha: 'Alpha · Relax',
  beta: 'Beta · Focus',
  gamma: 'Gamma · Clarity',
};

export type AmbientSoundId =
  | 'rain' | 'thunder' | 'ocean' | 'birds' | 'crickets' | 'campfire'
  | 'white' | 'pink' | 'brown';

export type AmbientNode = {
  source: ReturnType<AudioContext['createBufferSource']>;
  gain: ReturnType<AudioContext['createGain']>;
};

export const NOISE_IDS = new Set<AmbientSoundId>(['white', 'pink', 'brown']);

export const NATURE_SOUNDS: Array<{ id: AmbientSoundId; label: string; asset: number | null }> = [
  { id: 'rain',     label: 'Rain',        asset: require('../../assets/images/ambient/rain.mp3') },
  { id: 'thunder',  label: 'Thunder',     asset: require('../../assets/images/ambient/thunder.mp3') },
  { id: 'ocean',    label: 'Ocean Waves', asset: require('../../assets/images/ambient/ocean.mp3') },
  { id: 'birds',    label: 'Birds',       asset: require('../../assets/images/ambient/birds.mp3') },
  { id: 'crickets', label: 'Crickets',    asset: require('../../assets/images/ambient/crickets.mp3') },
  { id: 'campfire', label: 'Camp Fire',   asset: require('../../assets/images/ambient/campfire.mp3') },
];

export const NOISE_SOUNDS: Array<{ id: AmbientSoundId; label: string }> = [
  { id: 'white', label: 'White Noise' },
  { id: 'pink',  label: 'Pink Noise' },
  { id: 'brown', label: 'Brown Noise' },
];

export const affirmationPercentToGain = (percent: number) =>
  Math.max(0, Math.min(AFFIRMATION_MAX_GAIN, percent / 100));

export const withAlpha = (hexColor: string, alpha: number) => {
  const hex = hexColor.replace('#', '');
  const value =
    hex.length === 3 ? hex.split('').map((c) => `${c}${c}`).join('') : hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
