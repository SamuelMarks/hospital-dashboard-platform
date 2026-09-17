/**
 * @fileoverview Collaborator Presence Component.
 * Renders avatar indicators and status pills for active collaborators currently viewing
 * or editing the dashboard in real-time.
 */

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';

import {
  DashboardCollaborationService,
  CollaboratorProfile,
} from '../../core/collaboration/dashboard-collaboration.service';

/**
 * Component rendering active peer collaborator avatars on the dashboard toolbar.
 */
@Component({
  selector: 'app-collaborator-presence',
  standalone: true,
  imports: [CommonModule, MatTooltipModule, MatIconModule, MatChipsModule],
  template: `
    <div
      class="collaborator-presence-container collaborator-presence collaborators"
      data-testid="collaborator-presence"
    >
      @if (collaboratorService.isConnected()) {
        <span
          class="live-dot"
          matTooltip="Real-time collaboration active"
          data-testid="live-indicator"
        ></span>
      }

      <div class="avatars-group" data-testid="collaborator-avatars">
        @for (user of collaboratorService.activeCollaborators(); track user.user_id) {
          <div
            class="user-avatar"
            [matTooltip]="user.email + ' (' + (user.role || 'Collaborator') + ')'"
            data-testid="collaborator-avatar"
          >
            {{ getInitials(user.email) }}
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .collaborator-presence-container {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .live-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #22c55e;
        box-shadow: 0 0 6px #22c55e;
      }
      .avatars-group {
        display: flex;
        align-items: center;
        margin-left: 4px;
      }
      .user-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--sys-primary, #1976d2);
        color: #ffffff;
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid var(--sys-surface, #ffffff);
        margin-left: -6px;
        text-transform: uppercase;
        user-select: none;
      }
      .user-avatar:first-child {
        margin-left: 0;
      }
    `,
  ],
})
export class CollaboratorPresenceComponent {
  /** Injected collaboration service managing peer metadata. */
  readonly collaboratorService = inject(DashboardCollaborationService);

  /**
   * Generates initials from user email address.
   *
   * @param email The collaborator email string.
   * @returns Two-character initial representation.
   */
  getInitials(email: string): string {
    if (!email) {
      return '?';
    }
    const username = email.split('@')[0];
    const parts = username.split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return username.slice(0, 2).toUpperCase();
  }
}
