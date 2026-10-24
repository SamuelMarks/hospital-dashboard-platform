/**
 * @fileoverview Unit tests for `DashboardCollaborationService`.
 */

import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BROWSER_LOCATION,
  BrowserLocationLike,
  DashboardCollaborationService,
} from './dashboard-collaboration.service';
import { AuthService } from '../auth/auth.service';

/** Mock WebSocket implementation for unit testing real-time dashboard collaboration. */
class MockWebSocket {
  /** Created socket instances. */
  static instances: MockWebSocket[] = [];
  /** Whether the constructor should throw to simulate connection failures. */
  static shouldThrowOnConstruct = false;
  /** Open socket state constant. */
  static readonly OPEN = 1;
  /** Closed socket state constant. */
  static readonly CLOSED = 3;

  /** Current connection state. */
  readyState = 1;
  /** Spy for outbound messages. */
  send = vi.fn();
  /** Spy for socket close invocations. */
  close = vi.fn();
  /** Open event callback. */
  onopen: (() => void) | null = null;
  /** Message event callback. */
  onmessage: ((event: { data: string }) => void) | null = null;
  /** Error event callback. */
  onerror: (() => void) | null = null;
  /** Close event callback. */
  onclose: ((event: { code: number }) => void) | null = null;

  /**
   * Creates a mock WebSocket instance and records it in `MockWebSocket.instances`.
   *
   * @param url - Target WebSocket connection URL.
   */
  constructor(public url: string) {
    if (MockWebSocket.shouldThrowOnConstruct) {
      throw new Error('WebSocket construct error');
    }
    MockWebSocket.instances.push(this);
  }
}

describe('DashboardCollaborationService', () => {
  let service: DashboardCollaborationService;
  let authServiceMock: { getToken: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    MockWebSocket.instances = [];
    MockWebSocket.shouldThrowOnConstruct = false;
    authServiceMock = {
      getToken: vi.fn().mockReturnValue('mock-jwt-token'),
    };

    vi.stubGlobal('WebSocket', MockWebSocket);

    TestBed.configureTestingModule({
      providers: [
        DashboardCollaborationService,
        { provide: AuthService, useValue: authServiceMock },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    service = TestBed.inject(DashboardCollaborationService);
  });

  afterEach(() => {
    service.disconnect();
    vi.unstubAllGlobals();
    vi.clearAllTimers();
  });

  it('should initialize without active connections', () => {
    expect(service.isConnected()).toBe(false);
    expect(service.activeCollaborators().length).toBe(0);
  });

  it('should connect and update isConnected on socket open', () => {
    service.connect('dash-123');
    expect(MockWebSocket.instances.length).toBe(1);

    const ws = MockWebSocket.instances[0];
    ws?.onopen?.();
    expect(service.isConnected()).toBe(true);
  });

  it('constructs wss:// URL with remote host when BROWSER_LOCATION is https and non-local', () => {
    const customLoc: BrowserLocationLike = {
      protocol: 'https:',
      hostname: 'pulse.stanford.edu',
      host: 'pulse.stanford.edu:8443',
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DashboardCollaborationService,
        { provide: AuthService, useValue: authServiceMock },
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: BROWSER_LOCATION, useValue: customLoc },
      ],
    });

    const httpsService = TestBed.inject(DashboardCollaborationService);
    httpsService.connect('dash-ssl');
    expect(MockWebSocket.instances[0]?.url).toBe(
      'wss://pulse.stanford.edu:8443/api/v1/ws/dashboards/dash-ssl?token=mock-jwt-token',
    );
    httpsService.disconnect();
  });

  it('constructs ws://127.0.0.1:8000 URL when hostname is 127.0.0.1', () => {
    const loopbackLoc: BrowserLocationLike = {
      protocol: 'http:',
      hostname: '127.0.0.1',
      host: '127.0.0.1:4200',
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DashboardCollaborationService,
        { provide: AuthService, useValue: authServiceMock },
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: BROWSER_LOCATION, useValue: loopbackLoc },
      ],
    });

    const localService = TestBed.inject(DashboardCollaborationService);
    localService.connect('dash-local');
    expect(MockWebSocket.instances[0]?.url).toBe(
      'ws://127.0.0.1:8000/api/v1/ws/dashboards/dash-local?token=mock-jwt-token',
    );
    localService.disconnect();
  });

  it('should ignore connect in non-browser environment', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DashboardCollaborationService,
        { provide: AuthService, useValue: authServiceMock },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const serverService = TestBed.inject(DashboardCollaborationService);
    serverService.connect('dash-123');
    expect(serverService.isConnected()).toBe(false);
    expect(MockWebSocket.instances.length).toBe(0);
  });

  it('should not connect if auth token is missing', () => {
    authServiceMock.getToken.mockReturnValue(null);
    service.connect('dash-123');
    expect(service.isConnected()).toBe(false);
    expect(MockWebSocket.instances.length).toBe(0);
  });

  it('should not reconnect if already connected to the same dashboard', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    ws?.onopen?.();
    service.connect('dash-123');
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('should handle USER_JOINED, USER_LEFT without array, and unknown message types', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    const users = [
      {
        user_id: 'u1',
        email: 'doc@hospital.org',
        role: 'ATTENDING_PHYSICIAN',
        connected_at: '2026-09-15T00:00:00Z',
      },
    ];

    ws?.onmessage?.({
      data: JSON.stringify({
        type: 'USER_JOINED',
        active_users: users,
      }),
    });

    expect(service.activeCollaborators().length).toBe(1);
    expect(service.activeCollaborators()[0]?.email).toBe('doc@hospital.org');

    ws?.onmessage?.({
      data: JSON.stringify({
        type: 'USER_LEFT',
        active_users: null,
      }),
    });
    expect(service.activeCollaborators().length).toBe(1);

    ws?.onmessage?.({
      data: JSON.stringify({
        type: 'HEARTBEAT',
      }),
    });
    expect(service.activeCollaborators().length).toBe(1);
  });

  it('should handle WIDGET_UPDATED event', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    let emittedWidgetId: string | null = null;
    service.remoteWidgetUpdates$.subscribe((id) => (emittedWidgetId = id));

    ws?.onmessage?.({
      data: JSON.stringify({
        type: 'WIDGET_UPDATED',
        widget_id: 'widget-999',
      }),
    });

    expect(emittedWidgetId).toBe('widget-999');
  });

  it('should ignore malformed message data', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    expect(() => {
      ws?.onmessage?.({ data: 'invalid-json{' });
    }).not.toThrow();
  });

  it('should handle socket error', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    ws?.onopen?.();
    expect(service.isConnected()).toBe(true);

    ws?.onerror?.();
    expect(service.isConnected()).toBe(false);
  });

  it('should send messages when socket is open', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    if (ws) {
      ws.readyState = MockWebSocket.OPEN;
    }

    service.send({ type: 'REFRESH_REQUEST', widget_id: 'w1' });
    expect(ws?.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'REFRESH_REQUEST', widget_id: 'w1' }),
    );
  });

  it('should safely ignore send when socket is closed', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    if (ws) {
      ws.readyState = MockWebSocket.CLOSED;
    }

    service.send({ type: 'PING' });
    expect(ws?.send).not.toHaveBeenCalled();
  });

  it('should schedule reconnect on abnormal close code and stop after MAX_RECONNECT_ATTEMPTS', () => {
    vi.useFakeTimers();
    service.connect('dash-123');

    for (let i = 0; i < 5; i++) {
      const latestWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      latestWs?.onclose?.({ code: 1006 });
      vi.advanceTimersByTime(15000);
    }
    expect(MockWebSocket.instances.length).toBe(6);

    const finalWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    finalWs?.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(15000);
    expect(MockWebSocket.instances.length).toBe(6);

    vi.useRealTimers();
  });

  it('should schedule reconnect if WebSocket constructor throws and cancel timer on disconnect', () => {
    vi.useFakeTimers();
    MockWebSocket.shouldThrowOnConstruct = true;
    service.connect('dash-throw');
    expect(MockWebSocket.instances.length).toBe(0);

    service.disconnect();
    MockWebSocket.shouldThrowOnConstruct = false;
    vi.advanceTimersByTime(5000);
    expect(MockWebSocket.instances.length).toBe(0);
    vi.useRealTimers();
  });

  it('should not reconnect on normal (1000) or authorization error code (4401, 4403)', () => {
    vi.useFakeTimers();
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];

    ws?.onclose?.({ code: 1000 });
    vi.advanceTimersByTime(5000);
    expect(MockWebSocket.instances.length).toBe(1);

    ws?.onclose?.({ code: 4401 });
    vi.advanceTimersByTime(5000);
    expect(MockWebSocket.instances.length).toBe(1);

    ws?.onclose?.({ code: 4403 });
    vi.advanceTimersByTime(5000);
    expect(MockWebSocket.instances.length).toBe(1);
    vi.useRealTimers();
  });

  it('should clean up on disconnect and ngOnDestroy', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    ws?.onopen?.();
    expect(service.isConnected()).toBe(true);

    service.disconnect();
    expect(ws?.close).toHaveBeenCalled();
    expect(service.isConnected()).toBe(false);
    expect(service.activeCollaborators().length).toBe(0);

    service.ngOnDestroy();
  });
});
