/**
 * @fileoverview Unit tests for the `@material/material-color-utilities` test mock.
 */

import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
  Scheme,
  Theme,
} from './material-color-utilities';

describe('material-color-utilities mock', () => {
  it('converts hex to ARGB and back deterministically and seeds schemes', () => {
    expect(argbFromHex('#000000')).toBe(0xff000000);
    expect(hexFromArgb(0xff000000)).toBe('#000000');

    const blueArgb = argbFromHex('#1565c0');
    expect(blueArgb).toBe(0xff1565c0);
    expect(hexFromArgb(blueArgb)).toBe('#1565c0');
    expect(argbFromHex('invalid-hex')).toBe(0xffffffff);

    const theme = themeFromSourceColor(0xff00ff00);
    const light = theme.schemes.light;
    const dark = theme.schemes.dark;
    expect(light.primary).toBe(0xff00ff00);
    expect(dark.primary).toBe(0xff00ff00);

    expect(new Scheme()).toBeInstanceOf(Scheme);
    expect(new Theme()).toBeInstanceOf(Theme);
  });
});
