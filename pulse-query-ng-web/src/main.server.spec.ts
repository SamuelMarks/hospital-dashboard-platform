import { vi } from 'vitest';

const mockBootstrapApplication = vi.fn();

vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

vi.mock('@angular/platform-browser', async (importOriginal) => {
  const mod = await importOriginal();
  const { vi } = await import('vitest');
  return {
    ...(mod as any),
    bootstrapApplication: vi.fn(),
    provideClientHydration: vi.fn(() => []),
  };
});

describe('main.server bootstrap', () => {
  let bootstrapApplication: any;
  beforeEach(async () => {
    vi.resetModules();
    const pb = await import('@angular/platform-browser');
    bootstrapApplication = pb.bootstrapApplication as any;
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
