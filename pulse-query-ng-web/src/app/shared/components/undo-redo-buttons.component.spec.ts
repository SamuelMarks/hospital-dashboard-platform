/**
 * @fileoverview Unit tests for UndoRedoButtonsComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { UndoRedoButtonsComponent } from './undo-redo-buttons.component';
import { UndoRedoService } from '../../core/undo/undo-redo.service';

describe('UndoRedoButtonsComponent', () => {
  let component: UndoRedoButtonsComponent;
  let fixture: ComponentFixture<UndoRedoButtonsComponent>;
  let hostEl: HTMLElement;

  const canUndoSig = signal(false);
  const canRedoSig = signal(false);
  const undoDescSig = signal<string | null>(null);
  const redoDescSig = signal<string | null>(null);

  const mockUndoRedoService = {
    undo: vi.fn().mockResolvedValue(undefined),
    redo: vi.fn().mockResolvedValue(undefined),
    canUndo: canUndoSig,
    canRedo: canRedoSig,
    nextUndoDescription: undoDescSig,
    nextRedoDescription: redoDescSig,
    undoStackSize: signal(0),
    redoStackSize: signal(0),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UndoRedoButtonsComponent],
      providers: [{ provide: UndoRedoService, useValue: mockUndoRedoService }],
    }).compileComponents();

    fixture = TestBed.createComponent(UndoRedoButtonsComponent);
    component = fixture.componentInstance;
    hostEl = fixture.nativeElement as HTMLElement;
    canUndoSig.set(false);
    canRedoSig.set(false);
    undoDescSig.set(null);
    redoDescSig.set(null);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  it('should instantiate with new', () => {
    TestBed.runInInjectionContext(() => {
      new UndoRedoButtonsComponent();
    });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render undo and redo buttons', () => {
    expect(hostEl.querySelector('[data-testid="undo-button"]')).toBeTruthy();
    expect(hostEl.querySelector('[data-testid="redo-button"]')).toBeTruthy();
  });

  it('should disable undo button when canUndo is false', () => {
    canUndoSig.set(false);
    fixture.detectChanges();
    const btn = hostEl.querySelector('[data-testid="undo-button"]') as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(true);
  });

  it('should disable redo button when canRedo is false', () => {
    canRedoSig.set(false);
    fixture.detectChanges();
    const btn = hostEl.querySelector('[data-testid="redo-button"]') as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(true);
  });

  it('should enable undo button when canUndo is true', () => {
    canUndoSig.set(true);
    fixture.detectChanges();
    const btn = hostEl.querySelector('[data-testid="undo-button"]') as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(false);
  });

  it('should enable redo button when canRedo is true', () => {
    canRedoSig.set(true);
    fixture.detectChanges();
    const btn = hostEl.querySelector('[data-testid="redo-button"]') as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(false);
  });

  it('should call undo() when undo button clicked', async () => {
    canUndoSig.set(true);
    fixture.detectChanges();
    const btn = hostEl.querySelector('[data-testid="undo-button"]') as HTMLButtonElement | null;
    btn?.click();
    await fixture.whenStable();
    expect(mockUndoRedoService.undo).toHaveBeenCalledTimes(1);
  });

  it('should call redo() when redo button clicked', () => {
    canRedoSig.set(true);
    fixture.detectChanges();
    const btn = hostEl.querySelector('[data-testid="redo-button"]') as HTMLButtonElement | null;
    btn?.click();
    expect(mockUndoRedoService.redo).toHaveBeenCalledTimes(1);
  });

  it('should return base undo tooltip when no description', () => {
    undoDescSig.set(null);
    expect(component.undoTooltip()).toBe('Undo (Ctrl+Z)');
  });

  it('should include description in undo tooltip', () => {
    undoDescSig.set('Move widget');
    expect(component.undoTooltip()).toBe('Undo (Ctrl+Z): Move widget');
  });

  it('should return base redo tooltip when no description', () => {
    redoDescSig.set(null);
    expect(component.redoTooltip()).toBe('Redo (Ctrl+Shift+Z)');
  });

  it('should include description in redo tooltip', () => {
    redoDescSig.set('Delete widget');
    expect(component.redoTooltip()).toBe('Redo (Ctrl+Shift+Z): Delete widget');
  });

  it('should have aria-label="Undo" on undo button', () => {
    const btn = hostEl.querySelector('[data-testid="undo-button"]');
    expect(btn?.getAttribute('aria-label')).toBe('Undo');
  });

  it('should have aria-label="Redo" on redo button', () => {
    const btn = hostEl.querySelector('[data-testid="redo-button"]');
    expect(btn?.getAttribute('aria-label')).toBe('Redo');
  });
});
