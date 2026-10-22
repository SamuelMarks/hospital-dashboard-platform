/**
 * @fileoverview Collaborator Presence Component.
 * Renders avatar indicators and status pills for active collaborators currently viewing
 * or editing the dashboard in real-time.
 */

import { Component, inject } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  DashboardCollaborationService,
  CollaboratorProfile,
} from '../../core/collaboration/dashboard-collaboration.service';

/**
 * Component rendering active peer collaborator avatars on the dashboard toolbar.
 */
@Component({
  selector: 'app-collaborator-presence',
  imports: [MatTooltipModule],
  template: `
    <div
      class="collaborator-presence-container collaborator-presence collaborators"
      data-testid="collaborator-presence"
    >
      @if (collaboratorService.isConnected()) {
        <span
          class="live-dot"
          role="status"
          tabindex="0"
          matTooltip="Real-time collaboration active"
          i18n-matTooltip
          aria-label="Real-time collaboration active"
          i18n-aria-label
          data-testid="live-indicator"
        ></span>
      }

      <div class="avatars-group" data-testid="collaborator-avatars">
        @for (user of collaboratorService.activeCollaborators(); track user.user_id) {
          <div
            class="user-avatar"
            tabindex="0"
            [matTooltip]="getCollaboratorTooltip(user)"
            [attr.aria-label]="getCollaboratorTooltip(user)"
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
   * Formats a localized accessible tooltip label for a collaborator avatar.
   *
   * @param user The collaborator profile to describe.
   * @returns Localized tooltip string with email and role.
   */
  getCollaboratorTooltip(user: CollaboratorProfile): string {
    const roleLabel = user.role || $localize`Collaborator`;
    return $localize`${user.email} (${roleLabel})`;
  }

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
    const username = email.split('@', 1).join('');
    const parts = username.split(/[._-]/);
    if (parts.length >= 2) {
      return parts
        .slice(0, 2)
        .map((p) => p.slice(0, 1))
        .join('')
        .toUpperCase();
    }
    return username.slice(0, 2).toUpperCase();
  }
}
