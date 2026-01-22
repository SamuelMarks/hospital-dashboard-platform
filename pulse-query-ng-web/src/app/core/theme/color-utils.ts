/** 
 * @fileoverview Utilities for generating Material Design 3 (M3) Color Palettes. 
 * Wraps @material/material-color-utilities to convert a single hex seed color 
 * into a complete tonal scheme (Light/Dark) compatible with CSS Custom Properties. 
 */ 

import { 
  argbFromHex, 
  hexFromArgb, 
  themeFromSourceColor, 
  Scheme, 
  Theme 
} from '@material/material-color-utilities'; 

/** 
 * Type definition for a CSS Variable Map. 
 * Key is the variable name (e.g., '--sys-primary'), Value is the Hex color string. 
 */ 
export type CssVariableMap = Record<string, string>; 

/** 
 * Generates a mapping of System Design Tokens to Hex Colors based on a seed. 
 * 
 * Uses the Material Dynamic Color algorithms to generate tonal palettes. 
 * Maps the standard M3 tokens to our internal `--sys-*` namespace. 
 * 
 * @param {string} seedHex - The source color in Hex format (e.g., '#1976d2'). 
 * @param {boolean} isDark - Whether to generate a Dark Mode scheme. 
 * @returns {CssVariableMap} A dictionary of CSS variable names to hex values. 
 */ 
export function generateThemeVariables(seedHex: string, isDark: boolean): CssVariableMap { 
  // 1. Sanitize Input 
  const safeHex = isValidHex(seedHex) ? seedHex : '#1976d2'; // Fallback to Blue 
  const sourceArgb = argbFromHex(safeHex); 

  // 2. Generate M3 Theme Object 
  const theme: Theme = themeFromSourceColor(sourceArgb); 

  // 3. Select appropriate scheme (Light/Dark) 
  const scheme = isDark ? theme.schemes.dark : theme.schemes.light; 

  // 4. Map Scheme to CSS Variables 
  return mapSchemeToCssVars(scheme); 
} 

/** 
 * Validates a Hex Color string. 
 * 
 * @param {string} hex - The string to check. 
 * @returns {boolean} True if valid 3 or 6 digit hex (with optional alpha). 
 */ 
function isValidHex(hex: string): boolean { 
  return /^#([0-9A-F]{3}){1,2}$/i.test(hex); 
} 

/** 
 * Transforms a Material Color Scheme object into CSS Variable dictionary. 
 * Converts internal ARGB numbers back to Hex strings for CSS usage. 
 * 
 * @param {Scheme} scheme - The M3 Scheme object. 
 * @returns {CssVariableMap} The mapping of token names to hex values. 
 */ 
function mapSchemeToCssVars(scheme: Scheme): CssVariableMap { 
  const toHex = (argb: number) => hexFromArgb(argb); 

  return { 
    // Primary 
    '--sys-primary': toHex(scheme.primary), 
    '--sys-on-primary': toHex(scheme.onPrimary), 
    '--sys-primary-container': toHex(scheme.primaryContainer), 
    '--sys-on-primary-container': toHex(scheme.onPrimaryContainer), 

    // Secondary 
    '--sys-secondary': toHex(scheme.secondary), 
    '--sys-on-secondary': toHex(scheme.onSecondary), 
    '--sys-secondary-container': toHex(scheme.secondaryContainer), 
    '--sys-on-secondary-container': toHex(scheme.onSecondaryContainer), 

    // Tertiary 
    '--sys-tertiary': toHex(scheme.tertiary), 
    '--sys-on-tertiary': toHex(scheme.onTertiary), 
    '--sys-tertiary-container': toHex(scheme.tertiaryContainer), 
    '--sys-on-tertiary-container': toHex(scheme.onTertiaryContainer), 

    // Error / Warn 
    '--sys-error': toHex(scheme.error), 
    '--sys-on-error': toHex(scheme.onError), 
    '--sys-error-container': toHex(scheme.errorContainer), 
    '--sys-on-error-container': toHex(scheme.onErrorContainer), 
    
    // We map 'Warn' to 'Error' container conceptually, or standard Orange 
    // Since M3 doesn't have a distinct 'Warn', we use a static or computed amber for now. 
    // Here we will reuse error for semantic mapping or inject a custom variable if needed. 
    '--sys-warn': '#ffa000', // Keeps existing non-dynamic default or implement extension ref 

    // Surface / Background 
    '--sys-background': toHex(scheme.background), 
    '--sys-on-background': toHex(scheme.onBackground), 
    '--sys-surface': toHex(scheme.surface), 
    '--sys-on-surface': toHex(scheme.onSurface), 
    '--sys-surface-variant': toHex(scheme.surfaceVariant), 
    '--sys-on-surface-variant': toHex(scheme.onSurfaceVariant), 
    '--sys-outline': toHex(scheme.outline), 
    '--sys-outline-variant': toHex(scheme.outlineVariant), 
    '--sys-surface-border': toHex(scheme.outlineVariant), // Alias for existing app usage 

    // Interacttion States (Simulated opacities) 
    '--sys-hover': toHex(scheme.onSurface) + '14', // 8% opacity 
    '--sys-selected': toHex(scheme.primary) + '1f', // 12% opacity 
    '--sys-focus': toHex(scheme.onSurface) + '1f', // 12% opacity 
    
    // Chart Utility Colors (Derived from Tonal Palettes) 
    '--chart-color-1': toHex(scheme.primary), 
    '--chart-color-2': toHex(scheme.secondary), 
    '--chart-color-3': toHex(scheme.tertiary), 
    '--chart-neg': toHex(scheme.error) 
  }; 
}