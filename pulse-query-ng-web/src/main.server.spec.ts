/**
 * @fileoverview Unit tests for SSR `main.server.ts` bootstrap entry point.
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

describe('main.server bootstrap', () => {
  let bootstrapApplication: ReturnType<
    typeof vi.mocked<typeof import('@angular/platform-browser').bootstrapApplication>
  >;

  beforeEach(async () => {
    vi.resetModules();
    const pb = await import('@angular/platform-browser');
    bootstrapApplication = vi.mocked(pb.bootstrapApplication);
    bootstrapApplication.mockReset();
  });

  it('calls bootstrapApplication with context', async () => {
    bootstrapApplication.mockResolvedValue(undefined as never);

    const mod = await import('./main.server');

    await mod.default(undefined);

    expect(bootstrapApplication).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
    );
  });
});
