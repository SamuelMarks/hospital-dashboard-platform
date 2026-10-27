/**
 * @fileoverview Unit tests for `DashboardCollaborationCoordinator`.
 */

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import {
  CollaboratorProfile,
  DashboardCollaborationService,
} from '../core/collaboration/dashboard-collaboration.service';
import { DashboardCollaborationCoordinator } from './dashboard-collaboration-coordinator.service';

describe('DashboardCollaborationCoordinator', () => {
  let coordinator: DashboardCollaborationCoordinator;
  let remoteWidgetUpdates$: Subject<string>;
  let mockCollabService: {
    activeCollaborators: ReturnType<typeof signal<CollaboratorProfile[]>>;
    isConnected: ReturnType<typeof signal<boolean>>;
    remoteWidgetUpdates$: ReturnType<Subject<string>['asObservable']>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    remoteWidgetUpdates$ = new Subject<string>();
    mockCollabService = {
      activeCollaborators: signal<CollaboratorProfile[]>([]),
      isConnected: signal<boolean>(false),
      remoteWidgetUpdates$: remoteWidgetUpdates$.asObservable(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        DashboardCollaborationCoordinator,
        { provide: DashboardCollaborationService, useValue: mockCollabService },
      ],
    });

    coordinator = TestBed.inject(DashboardCollaborationCoordinator);
  });

  it('should expose activeCollaborators and isConnected signals and connect to dashboard', () => {
    expect(coordinator.activeCollaborators()).toEqual([]);
    expect(coordinator.isConnected()).toBe(false);

    const onWidgetUpdated = vi.fn();
    coordinator.connect('dash-1', onWidgetUpdated);

    expect(mockCollabService.connect).toHaveBeenCalledWith('dash-1');
    remoteWidgetUpdates$.next('w-101');
    expect(onWidgetUpdated).toHaveBeenCalledWith('w-101');

    // Reconnecting cleans up previous stream subscription
    const onWidgetUpdatedSecond = vi.fn();
    coordinator.connect('dash-2', onWidgetUpdatedSecond);
    remoteWidgetUpdates$.next('w-202');
    expect(onWidgetUpdated).toHaveBeenCalledTimes(1);
    expect(onWidgetUpdatedSecond).toHaveBeenCalledWith('w-202');
  });

  it('should route USER_JOINED, USER_LEFT, and WIDGET_UPDATED events via handleEvent', () => {
    const onPresence = vi.fn();
    const onWidget = vi.fn();
    const sampleUser: CollaboratorProfile = {
      user_id: 'u1',
      email: 'clinician@stanford.edu',
      role: 'Physician',
      connected_at: '2026-10-27T00:00:00Z',
    };

    coordinator.handleEvent(
      { type: 'USER_JOINED', active_users: [sampleUser] },
      onPresence,
      onWidget,
    );
    expect(onPresence).toHaveBeenCalledWith([sampleUser]);
    expect(onWidget).not.toHaveBeenCalled();

    coordinator.handleEvent({ type: 'USER_LEFT', active_users: [] }, onPresence, onWidget);
    expect(onPresence).toHaveBeenCalledWith([]);

    // Missing active_users array should safely no-op
    coordinator.handleEvent({ type: 'USER_JOINED' }, onPresence, onWidget);
    expect(onPresence).toHaveBeenCalledTimes(2);

    coordinator.handleEvent({ type: 'WIDGET_UPDATED', widget_id: 'w-55' }, onPresence, onWidget);
    expect(onWidget).toHaveBeenCalledWith('w-55');

    // Unknown or incomplete message should safely no-op
    coordinator.handleEvent({ type: 'PING' }, onPresence, onWidget);
    expect(onWidget).toHaveBeenCalledTimes(1);
  });

  it('should disconnect and clean up on ngOnDestroy', () => {
    const onWidgetUpdated = vi.fn();
    coordinator.connect('dash-1', onWidgetUpdated);
    coordinator.ngOnDestroy();

    expect(mockCollabService.disconnect).toHaveBeenCalledTimes(1);
    remoteWidgetUpdates$.next('w-after-destroy');
    expect(onWidgetUpdated).not.toHaveBeenCalled();
  });
});
