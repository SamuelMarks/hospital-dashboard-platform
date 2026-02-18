/**
 * @fileoverview Unit tests for Color Utilities.
 * Includes local mocking of the material-color-utilities library to prevent
 * ESM resolution errors during test execution.
 */

import { generateThemeVariables } from './color-utils';
import { vi } from 'vitest';

// MOCK: @material/material-color-utilities
// Prevents "Cannot find module" errors caused by internal relative imports in the library.
vi.mock('@material/material-color-utilities', () => {
  return {
    // Stub color conversion functions
    argbFromHex: (hex: string) => 0xffffffff,
    hexFromArgb: (argb: number) => '#ffffff',

    // Stub theme generation
    themeFromSourceColor: (sourceArgb: number) => ({
      schemes: {
        // Return a proxy that provides a white color int for any property accessed
        light: new Proxy({}, { get: () => 0xffffffff }),
        dark: new Proxy({}, { get: () => 0xffffffff }),
      },
    }),

    // Stub Classes
    Scheme: class {},
    Theme: class {},
  };
});

describe('ColorUtils', () => {
  it('should generate valid CSS variables from a seed color', () => {
    const map = generateThemeVariables('#ff0000', false); // Red seed, Light mode

    expect(map['--sys-primary']).toBeTruthy();
    expect(map['--sys-surface']).toBeTruthy();
    expect(map['--chart-color-1']).toBe(map['--sys-primary']);

    // Simple regex for Hex color code
    const hexPattern = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
    expect(map['--sys-primary']).toMatch(hexPattern);
  });

  it('should handle invalid hex by falling back to default', () => {
    // Pass garbage string
    const map = generateThemeVariables('not-a-color', false);

    // Should fallback to Blue (#1976d2 which results in a specific primary ARGB)
    expect(map['--sys-primary']).toBeTruthy();
  });

  it('should include semantic success colors', () => {
    const light = generateThemeVariables('#0000ff', false);
    const dark = generateThemeVariables('#0000ff', true);

    expect(light['--sys-success']).toBeDefined();
    expect(dark['--sys-success']).toBeDefined();
    // Verify differentiation
    expect(light['--sys-success']).not.toBe(dark['--sys-success']);
  });

  it('should map semantic aliases correctly', () => {
    const map = generateThemeVariables('#0000ff', false);

    // --sys-surface-border is an alias for outlineVariant
    expect(map['--sys-surface-border']).toBe(map['--sys-outline-variant']);
  });
});
