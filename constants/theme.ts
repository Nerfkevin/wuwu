
import { Platform } from 'react-native';

export const Colors = {
  background: '#0F0F12',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  border: '#333333',
  tint: '#FFFFFF',
  tabIconDefault: '#687076',
  tabIconSelected: '#FFFFFF',
  chakra: {
    red: '#FF006E',
    orange: '#FB5607',
    yellow: '#FFBE0B',
    green: '#00F5D4', // Added missing chakra colors for completeness if needed
    blue: '#00BBF9',
    indigo: '#4361EE',
    violet: '#7209B7',
    gradient: ['#FF006E', '#FB5607', '#FFBE0B', '#FF006E'] as const,
  }
};

export const Fonts = {
  serif: 'Arapey_400Regular',
  serifBold: 'Arapey_400Regular_Italic',
  mono: 'SpaceMono_400Regular',
};

export const Layout = {
  borderRadius: 24,
  padding: 20,
};
