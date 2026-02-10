export const argbFromHex = (_hex: string): number => 0xffffffff;
export const hexFromArgb = (_argb: number): string => '#ffffff';
export const themeFromSourceColor = (_sourceArgb: number) => ({
  schemes: {
    light: new Proxy({}, { get: () => 0xffffffff }),
    dark: new Proxy({}, { get: () => 0xffffffff })
  }
});

export class Scheme {}
export class Theme {}
