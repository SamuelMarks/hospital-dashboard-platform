import type { BootstrapContext } from '@angular/platform-browser';
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
  const mod = await importOriginal<typeof import('@angular/platform-browser')>();
  const { vi } = await import('vitest');
  return {
    ...mod,
    bootstrapApplication: vi.fn(),
    provideClientHydration: vi.fn(() => []),
  };
});

describe('main.server bootstrap', () => {
  let bootstrapApplication: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.resetModules();
    const pb = await import('@angular/platform-browser');
    bootstrapApplication = pb.bootstrapApplication as unknown as ReturnType<typeof vi.fn>;
    bootstrapApplication.mockReset();
  });

  it('calls bootstrapApplication with context', async () => {
    bootstrapApplication.mockResolvedValue(undefined);

    const mod = await import('./main.server');
    const context = {} as unknown as BootstrapContext;

    await mod.default(context);

    expect(bootstrapApplication).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      context,
    );
  });
});
