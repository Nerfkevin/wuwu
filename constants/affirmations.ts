import { Colors } from '@/constants/theme';

export type PillarKey =
  | 'Confidence'
  | 'Abundance'
  | 'Love'
  | 'Health'
  | 'Peace'
  | 'Focus';

export const AFFIRMATION_PILLARS: Record<
  PillarKey,
  { title: string; icon: string; color: string; messages: string[] }
> = {
  Confidence: {
    title: 'Self-Worth & Confidence',
    icon: 'flash',
    color: Colors.chakra.orange,
    messages: [
      'I trust myself and honor my worth every day.',
      'I speak up with clarity and confidence.',
      'I deserve respect and I receive it naturally.',
      'I stand tall in my power and authenticity.',
      'My voice matters and I use it wisely.',
      'I am proud of who I am becoming.',
    ],
  },
  Abundance: {
    title: 'Wealth & Abundance',
    icon: 'cash',
    color: Colors.chakra.green,
    messages: [
      'Money flows to me in expected and unexpected ways.',
      'I am a magnet for wealth, opportunities, and prosperity.',
      'Abundance is my natural state and I receive it freely.',
      'I deserve financial freedom and live it every day.',
      'My income increases steadily and joyfully.',
      'I release scarcity beliefs and embrace infinite supply.',
    ],
  },
  Love: {
    title: 'Love & Relationships',
    icon: 'heart',
    color: Colors.chakra.red,
    messages: [
      'I am deeply loved in healthy, reciprocal relationships.',
      'I attract people who respect and value me.',
      'I give and receive love with ease.',
      'My relationships are safe, kind, and supportive.',
      'I communicate honestly and lovingly.',
      'Love expands in my life every day.',
    ],
  },
  Health: {
    title: 'Health & Vitality',
    icon: 'fitness',
    color: Colors.chakra.yellow,
    messages: [
      'My body is strong, resilient, and energized.',
      'I nourish myself with choices that heal me.',
      'Vitality flows through every cell in my body.',
      'I feel calm, balanced, and healthy.',
      'My body knows how to restore itself.',
      'I move with strength and ease.',
    ],
  },
  Peace: {
    title: 'Peace & Mental Calm',
    icon: 'flower',
    color: Colors.chakra.blue,
    messages: [
      'I breathe in calm and exhale tension.',
      'My mind is quiet, clear, and centered.',
      'Peace surrounds me and lives within me.',
      'I release worry and trust the present moment.',
      'I am grounded, safe, and steady.',
      'Stillness restores me completely.',
    ],
  },
  Focus: {
    title: 'Focus & Achievement',
    icon: 'locate',
    color: Colors.chakra.indigo,
    messages: [
      'I focus easily and finish what I start.',
      'My goals are clear and I move toward them daily.',
      'I turn distractions into determination.',
      'I am disciplined, driven, and consistent.',
      'I make progress with every small step.',
      'Success builds through my focused effort.',
    ],
  },
};
