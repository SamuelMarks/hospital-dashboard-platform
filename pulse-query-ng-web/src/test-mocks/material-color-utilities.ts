export const argbFromHex = (_hex: string): number => 0xffffffff;
export const hexFromArgb = (_argb: number): string => '#ffffff';
export const themeFromSourceColor = (_sourceArgb: number) => ({
  schemes: {
    light: new Scheme(),
    dark: new Scheme()
  }
});

export class Scheme {
  primary = 0xffffffff;
  onPrimary = 0xffffffff;
  primaryContainer = 0xffffffff;
  onPrimaryContainer = 0xffffffff;
  secondary = 0xffffffff;
  onSecondary = 0xffffffff;
  secondaryContainer = 0xffffffff;
  onSecondaryContainer = 0xffffffff;
  tertiary = 0xffffffff;
  onTertiary = 0xffffffff;
  tertiaryContainer = 0xffffffff;
  onTertiaryContainer = 0xffffffff;
  error = 0xffffffff;
  onError = 0xffffffff;
  errorContainer = 0xffffffff;
  onErrorContainer = 0xffffffff;
  background = 0xffffffff;
  onBackground = 0xffffffff;
  surface = 0xffffffff;
  onSurface = 0xffffffff;
  surfaceVariant = 0xffffffff;
  onSurfaceVariant = 0xffffffff;
  outline = 0xffffffff;
  outlineVariant = 0xffffffff;
}

export class Theme {
  schemes = {
    light: new Scheme(),
    dark: new Scheme()
  };
}
