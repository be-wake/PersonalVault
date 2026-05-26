/**
 * Design tokens — single source of truth for the PDV design system.
 *
 * These values are mirrored as CSS custom properties in globals.css so they
 * work in both TypeScript (import { theme }) and plain CSS (var(--color-navy)).
 */

export const theme = {
  colors: {
    navy:     '#1B3A5C',
    blue:     '#196699',
    steel:    '#4A90C4',
    teal:     '#0F6A5B',
    tealLt:   '#E0F4EF',
    amber:    '#B07D18',
    amberLt:  '#FEF3DC',
    red:      '#A32D2D',
    redLt:    '#FDEAEA',
    surface:  '#FFFFFF',
    bg:       '#F5F6F8',
    border:   '#DDDEE9',
    text1:    '#1A1A2E',
    text2:    '#5A6178',
    text3:    '#93A0AB',
  },

  fonts: {
    sans: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },

  spacing: {
    xs:  '4px',
    sm:  '8px',
    md:  '12px',
    lg:  '16px',
    xl:  '24px',
    xxl: '32px',
  },

  radius: {
    sm:   '10px',
    md:   '14px',
    lg:   '20px',
    pill: '9999px',
  },
} as const;

export type ThemeColor   = keyof typeof theme.colors;
export type ThemeSpacing = keyof typeof theme.spacing;
export type ThemeRadius  = keyof typeof theme.radius;
