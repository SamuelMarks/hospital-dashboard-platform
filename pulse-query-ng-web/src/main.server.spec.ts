/**
 * @fileoverview Unit tests for the server-side application bootstrap function (`main.server.ts`).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApplicationRef } from '@angular/core';

vi.mock('@angular/platform-browser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@angular/platform-browser')>();
  const { vi } = await import('vitest');
  return {
    ...mod,
    bootstrapApplication: vi.fn(),
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

  it('should call bootstrapApplication with App, server config, and optional context', async () => {
    const fakeAppRef = {} as ApplicationRef;
    bootstrapApplication.mockResolvedValue(fakeAppRef);

    const { default: bootstrap } = await import('./main.server');
    const result = await bootstrap();

    expect(result).toBe(fakeAppRef);
    expect(bootstrapApplication).toHaveBeenCalledTimes(1);
  });
});
