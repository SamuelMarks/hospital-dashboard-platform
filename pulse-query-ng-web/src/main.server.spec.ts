import { vi } from 'vitest';

const bootstrapApplication = vi.fn();
const provideClientHydration = vi.fn(() => []);

vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

vi.mock('@angular/platform-browser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/platform-browser')>();
  return {
    ...actual,
    bootstrapApplication,
    provideClientHydration,
  };
});

vi.mock('./app/app', () => ({
  App: class {},
}));

vi.mock('./app/app.config.server', () => ({
  config: {},
}));

describe('main.server bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    bootstrapApplication.mockReset();
  });

  it('calls bootstrapApplication with context', async () => {
    bootstrapApplication.mockResolvedValue(undefined);

    const mod = await import('./main.server');
    const context = {} as any;

    await mod.default(context);

    expect(bootstrapApplication).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      context,
    );
  });
});
