import { PresetConfig } from '@/lib/animated-glow';
import { Colors } from './theme';

const withOpacity = (hexColor: string, opacity: number): string => {
  const hex = hexColor.replace('#', '');
  const value = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export const GlowPresets = {
  chakra: (
    radius: number,
    colors: string[] = [...Colors.chakra.gradient],
    glowSize: number = 20,
    pressGlowSize: number = 30
  ): PresetConfig => ({
    metadata: {
      name: 'Chakra',
      textColor: '#FFFFFF',
      category: 'Custom',
      tags: ['chakra']
    },
    states: [
      {
        name: 'default',
        preset: {
          cornerRadius: radius,
          outlineWidth: 0,
          glowLayers: [{ colors: colors, opacity: 0.6, glowSize }]
        }
      },
      {
        name: 'press',
        transition: 100,
        preset: {
          glowLayers: [{ glowSize: pressGlowSize, opacity: 0.8 }]
        }
      }
    ]
  }),
  vaporwave: (radius: number, primaryColor: string): PresetConfig => ({
    metadata: {
      name: 'Vaporwave',
      textColor: '#FFFFFF',
      category: 'Custom',
      tags: ['vaporwave']
    },
    states: [
      {
        name: 'default',
        preset: {
          cornerRadius: radius,
          outlineWidth: 0,
          borderColor: 'white',
          backgroundColor: 'rgba(0, 0, 0, 1)',
          animationSpeed: 2,
          borderSpeedMultiplier: 1,
          glowLayers: [
            {
              // @ts-ignore: glowPlacement is supported but types might be outdated
              glowPlacement: 'inside',
              colors: [primaryColor, '#FFFFFF', primaryColor, 'transparent', 'transparent'],
              glowSize: 2,
              opacity: 0.5,
              speedMultiplier: 1,
              coverage: 1,
              relativeOffset: 0
            },
            {
              // @ts-ignore
              glowPlacement: 'inside',
              colors: [primaryColor, '#FFFFFF', primaryColor, 'transparent', 'transparent'],
              glowSize: 4,
              opacity: 0.5,
              speedMultiplier: 1,
              coverage: 1,
              relativeOffset: 0
            },
            {
              // @ts-ignore
              glowPlacement: 'inside',
              colors: ['#FFFFFF', primaryColor],
              glowSize: 2,
              opacity: 0.9,
              speedMultiplier: 0.8,
              coverage: 1,
              relativeOffset: 0
            }
          ]
        }
      },
      {
        name: 'hover',
        transition: 300,
        preset: {
          animationSpeed: 3,
          glowLayers: [
            { glowSize: 6, opacity: 0.6 },
            { glowSize: 12, opacity: 0.6 },
            { glowSize: 5, opacity: 1 }
          ]
        }
      },
      {
        name: 'press',
        transition: 100,
        preset: {
          animationSpeed: 2.5,
          glowLayers: [
            { glowSize: 3, opacity: 0.7 },
            { glowSize: 6, opacity: 0.7 },
            { glowSize: 5, opacity: 1 }
          ]
        }
      }
    ]
  }),
  ripple: (radius: number, primaryColor: string, defaultGlowScale: number = 1): PresetConfig => ({
    metadata: {
      name: 'Ripple',
      textColor: '#FFFFFF',
      category: 'Custom',
      tags: ['ripple']
    },
    states: [
      {
        name: 'default',
        preset: {
          cornerRadius: radius,
          outlineWidth: 2,
          borderColor: [withOpacity(primaryColor, 0.95), withOpacity(primaryColor, 0.45)] as any,
          backgroundColor: 'transparent',
          animationSpeed: 1,
          borderSpeedMultiplier: 1,
          glowLayers: [
            {
              glowPlacement: 'behind' as any,
              colors: [
                withOpacity(primaryColor, 1),
                withOpacity(primaryColor, 0.6),
                'rgba(0, 0, 0, 0)'
              ],
              glowSize: 10 * defaultGlowScale,
              opacity: 0.42,
              speedMultiplier: 1,
              coverage: 1
            },
            {
              glowPlacement: 'behind' as any,
              colors: [
                withOpacity(primaryColor, 0.82),
                withOpacity(primaryColor, 0.58),
                'rgba(0, 0, 0, 0)'
              ],
              glowSize: 3 * defaultGlowScale,
              opacity: 1,
              speedMultiplier: 1,
              coverage: 1
            },
            {
              glowPlacement: 'behind' as any,
              colors: [
                withOpacity(primaryColor, 0.78),
                withOpacity(primaryColor, 0.45),
                'rgba(0, 0, 0, 0)'
              ],
              glowSize: [1, 2, 2, 1].map(v => v * defaultGlowScale) as any,
              opacity: 1,
              speedMultiplier: 1,
              coverage: 1
            }
          ]
        }
      },
      {
        name: 'hover',
        transition: 300,
        preset: {
          animationSpeed: 1.5,
          glowLayers: [
            { glowSize: 12, opacity: 0.5 },
            { glowSize: 4, opacity: 1 },
            { glowSize: [1, 2, 2, 1], opacity: 1 }
          ]
        }
      },
      {
        name: 'press',
        transition: 100,
        preset: {
          animationSpeed: 2,
          glowLayers: [
            { glowSize: 14, opacity: 0.58 },
            { glowSize: 4, opacity: 1 },
            { glowSize: [1, 3, 3, 1], opacity: 1 }
          ]
        }
      }
    ]
  })
};
