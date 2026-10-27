/**
 * @fileoverview Coordinator service bridging real-time WebSocket collaboration events
 * (`USER_JOINED`, `USER_LEFT`, `WIDGET_UPDATED`) with dashboard state refresh triggers.
 */

import { Service, inject, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  CollaborationMessage,
  CollaboratorProfile,
  DashboardCollaborationService,
} from '../core/collaboration/dashboard-collaboration.service';

/**
 * Coordinates real-time WebSocket collaboration subscriptions and dispatches
 * presence (`USER_JOINED`, `USER_LEFT`) and widget refresh (`WIDGET_UPDATED`) events.
 */
@Service()
export class DashboardCollaborationCoordinator implements OnDestroy {
  /** Underlying WebSocket collaboration service. */
  private readonly collaborationService = inject(DashboardCollaborationService);

  /** Active subscription to remote widget update notifications. */
  private widgetUpdateSub?: Subscription;

  /** Active subscription to raw inbound WebSocket collaboration frames. */
  private messageSub?: Subscription;

  /** Read-only signal of currently active collaborator profiles on the dashboard. */
  readonly activeCollaborators = this.collaborationService.activeCollaborators;

  /** Read-only signal indicating whether the collaboration WebSocket is connected. */
  readonly isConnected = this.collaborationService.isConnected;

  /**
   * Connects to the specified dashboard's collaboration channel and subscribes
   * to remote widget update events.
   *
   * @param dashboardId - Target dashboard UUID to join.
   * @param onWidgetUpdated - Callback invoked whenever a peer updates a widget.
   */
  connect(dashboardId: string, onWidgetUpdated: (widgetId: string) => void): void {
    this.unsubscribeStreams();
    this.collaborationService.connect(dashboardId);

    this.widgetUpdateSub = this.collaborationService.remoteWidgetUpdates$.subscribe((widgetId) => {
      onWidgetUpdated(widgetId);
    });
  }

  /**
   * Processes an inbound `CollaborationMessage` frame (`USER_JOINED`, `USER_LEFT`, `WIDGET_UPDATED`)
   * and returns the normalized list of active collaborators or updated widget ID.
   *
   * @param message - Parsed WebSocket collaboration message.
   * @param onPresenceChanged - Optional callback invoked with updated collaborator profiles.
   * @param onWidgetUpdated - Optional callback invoked when a widget update event is received.
   */
  handleEvent(
    message: CollaborationMessage,
    onPresenceChanged?: (users: CollaboratorProfile[]) => void,
    onWidgetUpdated?: (widgetId: string) => void,
  ): void {
    if (message.type === 'USER_JOINED' || message.type === 'USER_LEFT') {
      if (Array.isArray(message.active_users)) {
        onPresenceChanged?.(message.active_users);
      }
      return;
    }

    if (message.type === 'WIDGET_UPDATED' && typeof message.widget_id === 'string') {
      onWidgetUpdated?.(message.widget_id);
    }
  }

  /**
   * Disconnects the active collaboration session and cleans up event subscriptions.
   */
  disconnect(): void {
    this.unsubscribeStreams();
    this.collaborationService.disconnect();
  }

  /**
   * Cleans up subscriptions when the coordinator is destroyed.
   */
  ngOnDestroy(): void {
    this.disconnect();
  }

  /**
   * Unsubscribes active RxJS streams without closing the underlying socket.
   */
  private unsubscribeStreams(): void {
    this.widgetUpdateSub?.unsubscribe();
    this.widgetUpdateSub = undefined;
    this.messageSub?.unsubscribe();
    this.messageSub = undefined;
  }
}
