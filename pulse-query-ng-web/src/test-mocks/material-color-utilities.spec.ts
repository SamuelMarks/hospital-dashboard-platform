import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
  Scheme,
  Theme,
} from './material-color-utilities';

describe('material-color-utilities mock', () => {
  it('returns deterministic colors and schemes', () => {
    expect(argbFromHex('#000000')).toBe(0xffffffff);
    expect(hexFromArgb(0xff000000)).toBe('#ffffff');

    const theme = themeFromSourceColor(0xff00ff00);
    const light = theme.schemes.light;
    const dark = theme.schemes.dark;
    expect(light.primary).toBe(0xffffffff);
    expect(dark.primary).toBe(0xffffffff);

    expect(new Scheme()).toBeInstanceOf(Scheme);
    expect(new Theme()).toBeInstanceOf(Theme);
  });
});
