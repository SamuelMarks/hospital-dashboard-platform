/**
 * @fileoverview Unit tests for LoggerService.
 */

import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  it('delegates error and warn calls with and without supplemental arguments', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(LoggerService);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    service.error('Single error');
    service.error('With cause', new Error('boom'));
    service.warn('Single warn');
    service.warn('With context', { id: 1 });

    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    errSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
