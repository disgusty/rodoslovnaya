import { argbFromHex, hexFromArgb, Hct, SchemeTonalSpot } from '@material/material-color-utilities';
import type { DesignVersion } from '../model/types';

export const ACCENT_PRESETS = [
  '#6750A4', // MD3 baseline purple
  '#000080', // Windows 95 navy
  '#3F51B5', // indigo
  '#1E88E5', // blue
  '#00897B', // teal
  '#43A047', // green
  '#7CB342', // light green
  '#F9A825', // amber
  '#EF6C00', // orange
  '#E53935', // red
  '#D81B60', // pink
  '#8E24AA', // purple
  '#6D4C41', // brown
  '#546E7A', // blue grey
];

/** Palette for branches, links and card colors. */
export const LINE_COLORS = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB', '#1E88E5', '#039BE5', '#00ACC1',
  '#00897B', '#43A047', '#7CB342', '#C0CA33', '#FDD835', '#FFB300', '#FB8C00', '#F4511E',
  '#6D4C41', '#757575', '#546E7A',
];

type Tokens = Record<string, string>;

function md3Tokens(accent: string, dark: boolean): Tokens {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(accent)), dark, 0) as unknown as Record<string, number>;
  const c = (name: string) => hexFromArgb(scheme[name]);
  const names = [
    'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
    'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
    'tertiary', 'tertiaryContainer', 'onTertiaryContainer',
    'error', 'onError', 'errorContainer', 'onErrorContainer',
    'background', 'surface', 'surfaceDim',
    'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
    'onSurface', 'onSurfaceVariant', 'outline', 'outlineVariant',
    'inverseSurface', 'inverseOnSurface', 'inversePrimary',
  ];
  const out: Tokens = {};
  // camelCase → kebab-case token names
  for (const n of names) out[n.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())] = c(n);
  return {
    ...out,
    scrim: '#000000',
    canvas: c('surfaceContainerLow'),
    'app-bar': c('surfaceContainer'),
    'on-app-bar': c('onSurface'),
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const onColor = (hex: string) => (luminance(hex) > 0.4 ? '#000000de' : '#ffffff');

/** Material Design 1 (2014) palette: accent is used as-is, neutral greys for surfaces. */
function md1Tokens(accent: string, dark: boolean): Tokens {
  const on = onColor(accent);
  const surface = dark ? '#424242' : '#ffffff';
  const bg = dark ? '#303030' : '#fafafa';
  const primaryDark = mix(accent, '#000000', 0.25);
  return {
    primary: dark && luminance(accent) < 0.08 ? mix(accent, '#ffffff', 0.35) : accent,
    'on-primary': on,
    'primary-container': mix(surface, accent, dark ? 0.3 : 0.14),
    'on-primary-container': dark ? '#ffffff' : '#000000de',
    secondary: accent,
    'on-secondary': on,
    'secondary-container': dark ? '#616161' : '#e0e0e0',
    'on-secondary-container': dark ? '#ffffff' : '#000000de',
    tertiary: mix(accent, dark ? '#ffffff' : '#000000', 0.2),
    'tertiary-container': mix(surface, accent, 0.2),
    'on-tertiary-container': dark ? '#ffffff' : '#000000de',
    error: dark ? '#ef5350' : '#d32f2f',
    'on-error': '#ffffff',
    'error-container': dark ? '#5d1f1f' : '#ffebee',
    'on-error-container': dark ? '#ffcdd2' : '#b71c1c',
    background: bg,
    surface,
    'surface-dim': dark ? '#212121' : '#eeeeee',
    'surface-container-lowest': surface,
    'surface-container-low': surface,
    'surface-container': surface,
    'surface-container-high': dark ? '#4a4a4a' : '#f5f5f5',
    'surface-container-highest': dark ? '#545454' : '#eeeeee',
    'on-surface': dark ? '#ffffff' : '#000000de',
    'on-surface-variant': dark ? '#ffffffb3' : '#0000008a',
    outline: dark ? '#ffffff4d' : '#0000004d',
    'outline-variant': dark ? '#ffffff1f' : '#0000001f',
    'inverse-surface': dark ? '#e0e0e0' : '#323232',
    'inverse-on-surface': dark ? '#000000de' : '#ffffff',
    'inverse-primary': mix(accent, '#ffffff', 0.4),
    scrim: '#000000',
    canvas: bg,
    'app-bar': accent,
    'on-app-bar': on,
    'primary-dark': primaryDark,
  };
}

/**
 * Windows 95 color scheme (after themesberg/windows-95-ui-kit): grey 3D face, bevels,
 * teal desktop. The accent colors title bars and selection, like Win95 "Appearance" schemes.
 * Dark = a dark grey scheme in the spirit of the High Contrast schemes.
 */
function w95Tokens(accent: string, dark: boolean): Tokens {
  const face = dark ? '#3a3a3a' : '#c0c0c0';
  const text = dark ? '#ffffff' : '#000000';
  const window = dark ? '#1e1e1e' : '#ffffff';
  const on = onColor(accent) === '#ffffff' ? '#ffffff' : '#000000';
  return {
    primary: accent,
    'on-primary': on,
    'primary-container': accent,
    'on-primary-container': on,
    secondary: accent,
    'on-secondary': on,
    'secondary-container': face,
    'on-secondary-container': text,
    tertiary: accent,
    'tertiary-container': face,
    'on-tertiary-container': text,
    error: dark ? '#ff5555' : '#aa0000',
    'on-error': '#ffffff',
    'error-container': face,
    'on-error-container': text,
    background: face,
    surface: face,
    'surface-dim': face,
    'surface-container-lowest': face,
    'surface-container-low': face,
    'surface-container': face,
    'surface-container-high': face,
    'surface-container-highest': window,
    'on-surface': text,
    'on-surface-variant': dark ? '#c8c8c8' : '#404040',
    outline: dark ? '#9a9a9a' : '#808080',
    'outline-variant': dark ? '#5a5a5a' : '#808080',
    'inverse-surface': '#ffffe1', // tooltip yellow
    'inverse-on-surface': '#000000',
    'inverse-primary': accent,
    scrim: '#000000',
    canvas: dark ? '#003c3c' : '#008080',
    'app-bar': accent,
    'on-app-bar': on,
    // bevel palette
    'w95-face': face,
    'w95-window': window,
    'w95-light': dark ? '#6e6e6e' : '#ffffff',
    'w95-hilight': dark ? '#4e4e4e' : '#dfdfdf',
    'w95-shadow': dark ? '#202020' : '#808080',
    'w95-dark': dark ? '#000000' : '#0a0a0a',
    'w95-inactive': dark ? '#5a5a5a' : '#808080',
  };
}

export function applyTheme(design: DesignVersion, accent: string, dark: boolean) {
  const tokens = design === 'md1' ? md1Tokens(accent, dark) : design === 'w95' ? w95Tokens(accent, dark) : md3Tokens(accent, dark);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(`--md-${k}`, v);
  root.dataset.md = design === 'md1' ? '1' : design === 'w95' ? '95' : '3';
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
}

/** Card background tinted with the person's chosen color, adapted to theme. */
export function cardTint(color: string, dark: boolean): { bg: string; fg: string } {
  const bg = dark ? mix('#1c1b1f', color, 0.38) : mix('#ffffff', color, 0.22);
  return { bg, fg: dark ? '#ffffff' : '#1c1b1f' };
}
