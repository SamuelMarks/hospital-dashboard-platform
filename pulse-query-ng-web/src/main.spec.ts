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

vi.mock('./app/app.config', () => ({
  appConfig: {},
}));

describe('main bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
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
