/**
 * @fileoverview Unit tests for browser `main.ts` bootstrap entry point.
 */

import { vi } from 'vitest';

vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

vi.mock('@angular/platform-browser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@angular/platform-browser')>();
  const { vi } = await import('vitest');
  return {
    ...mod,
    bootstrapApplication: vi.fn(),
    provideClientHydration: vi.fn(() => []),
  };
});

describe('main bootstrap', () => {
  let bootstrapApplication: ReturnType<
    typeof vi.mocked<typeof import('@angular/platform-browser').bootstrapApplication>
  >;

  beforeEach(async () => {
    vi.resetModules();
    const pb = await import('@angular/platform-browser');
    bootstrapApplication = vi.mocked(pb.bootstrapApplication);
    bootstrapApplication.mockReset();
  });

  it('bootstraps the application', async () => {
    bootstrapApplication.mockResolvedValue(undefined as never);

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
