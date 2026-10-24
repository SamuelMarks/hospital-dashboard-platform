/**
 * @fileoverview Unit tests for TextEditorComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextEditorComponent } from './text-editor.component';
import { DashboardsService } from '../api-client';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { By } from '@angular/platform-browser';

describe('TextEditorComponent', () => {
  let component: TextEditorComponent;
  let fixture: ComponentFixture<TextEditorComponent>;
  let mockApi: {
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockApi = { updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn().mockReturnValue(of({})) };

    await TestBed.configureTestingModule({
      imports: [TextEditorComponent],
      providers: [{ provide: DashboardsService, useValue: mockApi }],
    }).compileComponents();

    fixture = TestBed.createComponent(TextEditorComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('dashboardId', 'd1');
    fixture.componentRef.setInput('widgetId', 'w1');
    fixture.componentRef.setInput('initialContent', 'Initial Text');

    fixture.detectChanges();
  });

  it('should initialize with content', () => {
    expect(component.formModel().content).toBe('Initial Text');
  });

  it('should call API on save', () => {
    component.formModel.set({ content: 'New Text' });
    component.save();

    expect(mockApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({ config: { content: 'New Text' } }),
    );
  });

  it('should not save when form invalid', () => {
    component.formModel.set({ content: '' });
    fixture.detectChanges();
    component.save();
    expect(mockApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should emit contentChange on success', () => {
    const emitSpy = vi.spyOn(component.contentChange, 'emit');
    component.formModel.set({ content: 'Emit Text' });
    component.save();
    expect(emitSpy).toHaveBeenCalledWith('Emit Text');
  });

  it('should handle API errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => new Error('fail')),
    );
    component.formModel.set({ content: 'Err Text' });
    component.save();

    expect(component.isRunning()).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should wire save button click in template', () => {
    const saveSpy = vi.spyOn(component, 'save');
    component.formModel.set({ content: 'Click Save' });
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('button[mat-flat-button]'));
    btn.triggerEventHandler('click', null);
    expect(saveSpy).toHaveBeenCalled();
  });

  it('should submit form from template', () => {
    const saveSpy = vi.spyOn(component, 'save');
    component.save();
    expect(saveSpy).toHaveBeenCalled();
  });

  it('should show spinner when running', () => {
    component.isRunning.set(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('mat-spinner'))).toBeTruthy();
  });
});
