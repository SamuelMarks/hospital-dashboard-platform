/**
 * @fileoverview Unit tests for [BenchmarkProgressService].
 */

import { TestBed } from '@angular/core/testing';

import {
  BenchmarkProgressService,
  BenchmarkProgress,
  isBenchmarkProgress,
} from './benchmark-progress.service';

describe('BenchmarkProgressService', () => {
  let service: BenchmarkProgressService;
  let mockEventSource: {
    close: ReturnType<typeof vi.fn>;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
  };

  beforeEach(() => {
    mockEventSource = {
      close: vi.fn(),
      onmessage: null,
      onerror: null,
    };

    /**
     * Mock EventSource constructor returning the shared `mockEventSource` instance.
     *
     * @returns Shared mock EventSource instance.
     */
    function MockEventSourceConstructor(): typeof mockEventSource {
      return mockEventSource;
    }
    vi.stubGlobal('EventSource', MockEventSourceConstructor);

    TestBed.configureTestingModule({
      providers: [BenchmarkProgressService],
    });

    service = TestBed.inject(BenchmarkProgressService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should create service and initialize with null progress', () => {
    expect(service).toBeTruthy();
    expect(service.progress()).toBeNull();
  });

  it('should connect to SSE stream and emit parsed progress events', () => {
    let received: BenchmarkProgress | null = null;
    const sub = service.connect().subscribe((p) => {
      received = p;
    });

    const samplePayload: BenchmarkProgress = {
      active: true,
      completed: 3,
      total: 10,
      current_model: 'gemini-1.5',
      status: 'evaluating',
      eta_seconds: 45,
    };

    mockEventSource.onmessage?.({
      data: JSON.stringify(samplePayload),
    } as MessageEvent);

    expect(received).toEqual(samplePayload);
    expect(service.progress()).toEqual(samplePayload);

    sub.unsubscribe();
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it('should gracefully handle malformed JSON messages and non-conforming shapes without throwing', () => {
    let emissionCount = 0;
    const sub = service.connect().subscribe(() => {
      emissionCount++;
    });

    mockEventSource.onmessage?.({ data: 'invalid-json' } as MessageEvent);
    mockEventSource.onmessage?.({ data: 'null' } as MessageEvent);
    mockEventSource.onmessage?.({ data: JSON.stringify({ active: 'not-bool' }) } as MessageEvent);

    expect(emissionCount).toBe(0);
    expect(service.progress()).toBeNull();
    expect(isBenchmarkProgress(null)).toBe(false);
    expect(
      isBenchmarkProgress({
        active: true,
        completed: 1,
        total: 2,
        current_model: 'm',
        status: 's',
        eta_seconds: 5,
      }),
    ).toBe(true);

    sub.unsubscribe();
  });

  it('should propagate SSE errors to observer', () => {
    let errorReceived = false;
    const sub = service.connect().subscribe({
      error: () => {
        errorReceived = true;
      },
    });

    mockEventSource.onerror?.(new Event('error'));

    expect(errorReceived).toBe(true);
    sub.unsubscribe();
  });

  it('should disconnect safely when no active connection exists', () => {
    expect(() => service.disconnect()).not.toThrow();
  });
});
