/**
 * @fileoverview Real-Time WebSocket Collaboration Service.
 * Manages bi-directional WebSocket communication between collaborators on a shared dashboard,
 * facilitating presence indicators, remote layout updates, and live widget refresh synchronization.
 */

import { Injectable, inject, signal, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';
import { AuthService } from '../auth/auth.service';

/**
 * Collaborator metadata profile broadcast over WebSockets.
 */
export interface CollaboratorProfile {
  /** Identifier of the collaborator user. */
  user_id: string;
  /** Collaborator email address. */
  email: string;
  /** Clinical or administrative role. */
  role: string;
  /** Timestamp when user joined the session. */
  connected_at: string;
}

/**
 * Inbound collaboration WebSocket message structure.
 */
export interface CollaborationMessage {
  /** Event action type string. */
  type: string;
  /** Individual collaborator profile payload. */
  user?: CollaboratorProfile;
  /** List of all active collaborator profiles currently online. */
  active_users?: CollaboratorProfile[];
  /** Optional widget identifier targeted by update event. */
  widget_id?: string;
  /** Arbitrary supplementary properties. */
  [key: string]: unknown;
}

/**
 * Service managing real-time WebSocket connection to a specific dashboard.
 */
@Injectable({
  providedIn: 'root',
})
export class DashboardCollaborationService implements OnDestroy {
  /** Authentication service dependency. */
  private readonly authService = inject(AuthService);
  /** Angular platform ID. */
  private readonly platformId = inject(PLATFORM_ID);

  /** Active WebSocket connection instance. */
  private socket: WebSocket | null = null;
  /** Identifier of the currently connected dashboard. */
  private currentDashboardId: string | null = null;
  /** Reconnection timer handle. */
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Count of failed reconnection attempts. */
  private reconnectAttempts = 0;
  /** Maximum number of reconnection attempts before giving up. */
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  /** Signal containing list of currently connected collaborator profiles. */
  readonly activeCollaborators = signal<CollaboratorProfile[]>([]);

  /** Signal indicating whether the WebSocket is currently open and connected. */
  readonly isConnected = signal<boolean>(false);

  /** Subject emitting raw parsed messages from the WebSocket channel. */
  readonly message$ = new Subject<CollaborationMessage>();

  /** Subject emitting IDs of widgets that peers have requested a refresh on. */
  readonly remoteWidgetUpdates$ = new Subject<string>();

  /**
   * Connects to the real-time WebSocket channel for the given dashboard ID.
   *
   * @param dashboardId UUID of the target dashboard.
   */
  connect(dashboardId: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (
      this.currentDashboardId === dashboardId &&
      this.socket &&
      this.socket.readyState === WebSocket.OPEN
    ) {
      return;
    }

    this.disconnect();
    this.currentDashboardId = dashboardId;
    this.initSocket();
  }

  /**
   * Closes active WebSocket connection and resets collaboration state.
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = 0;

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }

    this.currentDashboardId = null;
    this.isConnected.set(false);
    this.activeCollaborators.set([]);
  }

  /**
   * Broadcasts a JSON message payload to other connected collaborators.
   *
   * @param message Message payload to send across the socket.
   */
  send(message: Record<string, unknown>): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Cleans up connections on service destruction.
   */
  ngOnDestroy(): void {
    this.disconnect();
    this.message$.complete();
    this.remoteWidgetUpdates$.complete();
  }

  /**
   * Initializes the WebSocket connection with auth token and dashboard URL.
   */
  private initSocket(): void {
    const token = this.authService.getToken();
    if (!token || !this.currentDashboardId) {
      return;
    }

    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const host =
      loc.hostname === 'localhost' || loc.hostname === '127.0.0.1'
        ? `${loc.hostname}:8000`
        : loc.host;
    const url = `${protocol}//${host}/api/v1/ws/dashboards/${this.currentDashboardId}?token=${encodeURIComponent(token)}`;

    try {
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.isConnected.set(true);
        this.reconnectAttempts = 0;
      };

      this.socket.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.socket.onerror = () => {
        this.isConnected.set(false);
      };

      this.socket.onclose = (event: CloseEvent) => {
        this.isConnected.set(false);
        this.socket = null;
        if (event.code !== 1000 && event.code !== 4401 && event.code !== 4403) {
          this.scheduleReconnect();
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  /**
   * Processes inbound WebSocket messages and dispatches state updates.
   *
   * @param rawData Serialized JSON payload string from WebSocket.
   */
  private handleMessage(rawData: string): void {
    try {
      const data: CollaborationMessage = JSON.parse(rawData);
      this.message$.next(data);

      if (data.type === 'USER_JOINED' || data.type === 'USER_LEFT') {
        if (Array.isArray(data.active_users)) {
          this.activeCollaborators.set(data.active_users);
        }
      } else if (data.type === 'WIDGET_UPDATED' && typeof data.widget_id === 'string') {
        this.remoteWidgetUpdates$.next(data.widget_id);
      }
    } catch {
      // Ignore unparseable frames
    }
  }

  /**
   * Schedules a delayed reconnect attempt with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS || !this.currentDashboardId) {
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      if (this.currentDashboardId) {
        this.initSocket();
      }
    }, backoffMs);
  }
}
