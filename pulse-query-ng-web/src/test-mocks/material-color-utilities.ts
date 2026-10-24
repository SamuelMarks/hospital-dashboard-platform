/**
 * @fileoverview Test mock implementation of `@material/material-color-utilities`
 * providing deterministic ARGB color tokens and scheme palettes for unit tests.
 */

/**
 * Container holding light and dark Material Design color schemes.
 */
export interface MockThemeSchemes {
  /** Light mode Material color scheme. */
  light: Scheme;
  /** Dark mode Material color scheme. */
  dark: Scheme;
}

/**
 * Converts a hexadecimal color string into a 32-bit ARGB integer.
 *
 * @param _hex - Hexadecimal color string to convert.
 * @returns Deterministic ARGB color integer (`0xffffffff`).
 */
export function argbFromHex(_hex: string): number {
  return 0xffffffff;
}

/**
 * Converts a 32-bit ARGB integer into a hexadecimal color string.
 *
 * @param _argb - ARGB integer representation of a color.
 * @returns Deterministic hex color string (`'#ffffff'`).
 */
export function hexFromArgb(_argb: number): string {
  return '#ffffff';
}

/**
 * Generates a mock Material Design theme from a source ARGB color.
 *
 * @param _sourceArgb - Source seed color in ARGB format.
 * @returns Object containing light and dark `Scheme` instances.
 */
export function themeFromSourceColor(_sourceArgb: number): { schemes: MockThemeSchemes } {
  return {
    schemes: {
      light: new Scheme(),
      dark: new Scheme(),
    },
  };
}

/**
 * Mock Material Design color scheme containing ARGB token values for surface and accent roles.
 */
export class Scheme {
  /** Primary brand color token in ARGB format. */
  primary = 0xffffffff;
  /** Foreground color token for content on top of primary surfaces. */
  onPrimary = 0xffffffff;
  /** Container fill color token for primary-accented elements. */
  primaryContainer = 0xffffffff;
  /** Foreground color token for content inside a primary container. */
  onPrimaryContainer = 0xffffffff;
  /** Secondary supporting color token in ARGB format. */
  secondary = 0xffffffff;
  /** Foreground color token for content on top of secondary surfaces. */
  onSecondary = 0xffffffff;
  /** Container fill color token for secondary-accented elements. */
  secondaryContainer = 0xffffffff;
  /** Foreground color token for content inside a secondary container. */
  onSecondaryContainer = 0xffffffff;
  /** Tertiary accent color token in ARGB format. */
  tertiary = 0xffffffff;
  /** Foreground color token for content on top of tertiary surfaces. */
  onTertiary = 0xffffffff;
  /** Container fill color token for tertiary-accented elements. */
  tertiaryContainer = 0xffffffff;
  /** Foreground color token for content inside a tertiary container. */
  onTertiaryContainer = 0xffffffff;
  /** Semantic error state color token in ARGB format. */
  error = 0xffffffff;
  /** Foreground color token for content on top of error surfaces. */
  onError = 0xffffffff;
  /** Container fill color token for error notifications and banners. */
  errorContainer = 0xffffffff;
  /** Foreground color token for content inside an error container. */
  onErrorContainer = 0xffffffff;
  /** Default page background color token in ARGB format. */
  background = 0xffffffff;
  /** Default foreground text color token on the page background. */
  onBackground = 0xffffffff;
  /** Card and sheet surface color token in ARGB format. */
  surface = 0xffffffff;
  /** Primary text and icon color token on surface elements. */
  onSurface = 0xffffffff;
  /** Alternative surface color token for subtle visual differentiation. */
  surfaceVariant = 0xffffffff;
  /** Muted text and icon color token on variant surfaces. */
  onSurfaceVariant = 0xffffffff;
  /** Border and divider stroke color token in ARGB format. */
  outline = 0xffffffff;
  /** Subtle decorative border color token in ARGB format. */
  outlineVariant = 0xffffffff;
}

/**
 * Mock Material Design theme container holding light and dark color schemes.
 */
export class Theme {
  /** Light and dark color scheme instances for the theme. */
  schemes = {
    light: new Scheme(),
    dark: new Scheme(),
  };
}
