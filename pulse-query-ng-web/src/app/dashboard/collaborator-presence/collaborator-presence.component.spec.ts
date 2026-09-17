/**
 * @fileoverview Unit tests for CollaboratorPresenceComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';

import { CollaboratorPresenceComponent } from './collaborator-presence.component';
import {
  DashboardCollaborationService,
  CollaboratorProfile,
} from '../../core/collaboration/dashboard-collaboration.service';

describe('CollaboratorPresenceComponent', () => {
  let component: CollaboratorPresenceComponent;
  let fixture: ComponentFixture<CollaboratorPresenceComponent>;

  const activeCollaboratorsMock = signal<CollaboratorProfile[]>([]);
  const isConnectedMock = signal<boolean>(false);

  const mockService = {
    activeCollaborators: activeCollaboratorsMock,
    isConnected: isConnectedMock,
  };

  beforeEach(async () => {
    activeCollaboratorsMock.set([]);
    isConnectedMock.set(false);

    await TestBed.configureTestingModule({
      imports: [CollaboratorPresenceComponent],
      providers: [{ provide: DashboardCollaborationService, useValue: mockService }],
    }).compileComponents();

    fixture = TestBed.createComponent(CollaboratorPresenceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display initials correctly', () => {
    expect(component.getInitials('john.doe@hospital.org')).toBe('JD');
    expect(component.getInitials('sarah_connor@hospital.org')).toBe('SC');
    expect(component.getInitials('admin@hospital.org')).toBe('AD');
    expect(component.getInitials('')).toBe('?');
  });

  it('should render avatars when active collaborators exist', () => {
    isConnectedMock.set(true);
    activeCollaboratorsMock.set([
      {
        user_id: 'u1',
        email: 'alice.smith@hospital.org',
        role: 'CHARGE_NURSE',
        connected_at: '2026-09-15T00:00:00Z',
      },
    ]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const avatar = compiled.querySelector('[data-testid="collaborator-avatar"]');
    expect(avatar).toBeTruthy();
    expect(avatar?.textContent?.trim()).toBe('AS');

    const liveDot = compiled.querySelector('[data-testid="live-indicator"]');
    expect(liveDot).toBeTruthy();
  });
});
