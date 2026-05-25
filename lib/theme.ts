// A6 Cyan Aurora Glass — dark glassmorphism palette.
// Cyan-dominant, used by every screen primitive.

import { Platform } from 'react-native';

export const A6 = {
  bgInk:        '#021015',
  bgInk2:       '#03191F',
  primary:      '#06B6D4',
  primaryLight: '#22D3EE',
  secondary:    '#34D399',
  tertiary:     '#60A5FA',
  fg1:          '#EAF6FF',
  fg2:          'rgba(234,246,255,0.55)',
  fg3:          'rgba(234,246,255,0.4)',
  fgFaint:      'rgba(234,246,255,0.08)',
  hairline:     'rgba(255,255,255,0.08)',
  cardBg:       'rgba(255,255,255,0.04)',
  inputBg:      'rgba(255,255,255,0.03)',
  danger:       '#F87171',
  warn:         '#FBBF24',
} as const;

// System sans — looks close to Space Grotesk. iOS: SF Pro, Android: Roboto.
export const A6Font = {
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) as string,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Menlo' }) as string,
} as const;

export type A6Palette = typeof A6;
