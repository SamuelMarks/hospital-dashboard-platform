/**
 * @fileoverview Unit tests for AskDataService.
 */

import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AskDataService } from './ask-data.service';

describe('AskDataService', () => {
  let service: AskDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AskDataService);
  });

  it('should be created with initial state closed', () => {
    expect(service).toBeTruthy();
    expect(service.isOpen()).toBe(false);
  });

  it('should open the sidebar', () => {
    service.open();
    expect(service.isOpen()).toBe(true);
  });

  it('should close the sidebar', () => {
    service.open();
    service.close();
    expect(service.isOpen()).toBe(false);
  });

  it('should toggle state and restore focus to trigger element on close', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.focus();
    const focusSpy = vi.spyOn(btn, 'focus');

    // Initial False -> True (captures activeElement)
    service.toggle();
    expect(service.isOpen()).toBe(true);

    // True -> False (restores focus to btn)
    service.toggle();
    expect(service.isOpen()).toBe(false);
    expect(focusSpy).toHaveBeenCalled();

    // Explicit trigger element
    service.open(btn);
    expect(service.isOpen()).toBe(true);
    service.close();
    expect(focusSpy).toHaveBeenCalledTimes(2);

    // Null trigger element
    service.open(null);
    service.close();

    // Non-HTMLElement activeElement branch
    Object.defineProperty(document, 'activeElement', { value: null, configurable: true });
    service.open();
    service.close();
    delete (document as unknown as Record<string, unknown>)['activeElement'];

    document.body.removeChild(btn);
  });
});
