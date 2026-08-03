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

describe('main bootstrap', () => {
  let bootstrapApplication: any;
  beforeEach(async () => {
    vi.resetModules();
    const pb = await import('@angular/platform-browser');
    bootstrapApplication = pb.bootstrapApplication as any;
    bootstrapApplication.mockReset();
  });

  it('bootstraps the application', async () => {
    bootstrapApplication.mockResolvedValue(undefined);

    await import('./main');

    expect(bootstrapApplication).toHaveBeenCalled();
  });

  it('logs when bootstrap fails', async () => {
    const error = new Error('boom');
    bootstrapApplication.mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('./main');
    await Promise.resolve();

    expect(consoleSpy).toHaveBeenCalledWith('Application Bootstrap Failed:', error);
    consoleSpy.mockRestore();
  });
});
