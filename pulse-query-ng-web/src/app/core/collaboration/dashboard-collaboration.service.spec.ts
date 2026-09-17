/**
 * @fileoverview Unit tests for DashboardCollaborationService.
 */

import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DashboardCollaborationService } from './dashboard-collaboration.service';
import { AuthService } from '../auth/auth.service';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState = 1;
  send = vi.fn();
  close = vi.fn();
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
}

describe('DashboardCollaborationService', () => {
  let service: DashboardCollaborationService;
  let authServiceMock: { getToken: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    MockWebSocket.instances = [];
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
    ws.onopen?.();
    expect(service.isConnected()).toBe(true);
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
    ws.onopen?.();
    service.connect('dash-123');
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('should handle USER_JOINED and update active collaborators', () => {
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

    ws.onmessage?.({
      data: JSON.stringify({
        type: 'USER_JOINED',
        active_users: users,
      }),
    });

    expect(service.activeCollaborators().length).toBe(1);
    expect(service.activeCollaborators()[0].email).toBe('doc@hospital.org');
  });

  it('should handle WIDGET_UPDATED event', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    let emittedWidgetId: string | null = null;
    service.remoteWidgetUpdates$.subscribe((id) => (emittedWidgetId = id));

    ws.onmessage?.({
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
      ws.onmessage?.({ data: 'invalid-json{' });
    }).not.toThrow();
  });

  it('should handle socket error', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    expect(service.isConnected()).toBe(true);

    ws.onerror?.();
    expect(service.isConnected()).toBe(false);
  });

  it('should send messages when socket is open', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    ws.readyState = MockWebSocket.OPEN;

    service.send({ type: 'REFRESH_REQUEST', widget_id: 'w1' });
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'REFRESH_REQUEST', widget_id: 'w1' }),
    );
  });

  it('should safely ignore send when socket is closed', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    ws.readyState = MockWebSocket.CLOSED;

    service.send({ type: 'PING' });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('should schedule reconnect on abnormal close code', () => {
    vi.useFakeTimers();
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];

    ws.onclose?.({ code: 1006 }); // Abnormal closure
    expect(service.isConnected()).toBe(false);

    vi.advanceTimersByTime(1500);
    expect(MockWebSocket.instances.length).toBe(2);
    vi.useRealTimers();
  });

  it('should not reconnect on authorization error code 4401 or 4403', () => {
    vi.useFakeTimers();
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];

    ws.onclose?.({ code: 4401 });
    vi.advanceTimersByTime(5000);
    expect(MockWebSocket.instances.length).toBe(1);

    ws.onclose?.({ code: 4403 });
    vi.advanceTimersByTime(5000);
    expect(MockWebSocket.instances.length).toBe(1);
    vi.useRealTimers();
  });

  it('should clean up on disconnect and ngOnDestroy', () => {
    service.connect('dash-123');
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    expect(service.isConnected()).toBe(true);

    service.disconnect();
    expect(ws.close).toHaveBeenCalled();
    expect(service.isConnected()).toBe(false);
    expect(service.activeCollaborators().length).toBe(0);

    service.ngOnDestroy();
  });
});
