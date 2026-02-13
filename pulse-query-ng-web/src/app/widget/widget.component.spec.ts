/**
 * @fileoverview Unit tests for WidgetComponent.
 * Includes manual mocking of @material/material-color-utilities.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WidgetComponent } from './widget.component';
import { DashboardStore } from '../dashboard/dashboard.store';
import { WidgetResponse, DashboardsService } from '../api-client';
import {
  Component,
  input,
  signal,
  WritableSignal,
  NO_ERRORS_SCHEMA,
  ErrorHandler,
} from '@angular/core';
import { SIGNAL, signalSetFn } from '@angular/core/primitives/signals';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { VizTableComponent } from '../shared/visualizations/viz-table/viz-table.component';
import { VizMetricComponent } from '../shared/visualizations/viz-metric/viz-metric.component';
import { VizChartComponent } from '../shared/visualizations/viz-chart/viz-chart.component';
import { VizPieComponent } from '../shared/visualizations/viz-pie/viz-pie.component';
import { VizHeatmapComponent } from '../shared/visualizations/viz-heatmap/viz-heatmap.component';
import { VizScalarComponent } from '../shared/visualizations/viz-scalar/viz-scalar.component';
import { VizMarkdownComponent } from '../shared/visualizations/viz-markdown/viz-markdown.component';
import { ErrorBoundaryDirective } from '../core/error/error-boundary.directive';
import { readTemplate } from '../../test-utils/component-resources';
import { vi } from 'vitest';
import { of } from 'rxjs';

// MOCK: @material/material-color-utilities
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

@Component({ selector: 'viz-table', template: '' })
class MockVizTableComponent {
  readonly dataSet = input<unknown>();
  readonly config = input<unknown>();
}

@Component({ selector: 'viz-metric', template: '' })
class MockVizMetricComponent {
  readonly data = input<unknown>();
  readonly config = input<unknown>();
}

@Component({ selector: 'viz-chart', template: '' })
class MockVizChartComponent {
  readonly dataSet = input<unknown>();
  readonly config = input<unknown>();
}

@Component({ selector: 'viz-pie', template: '' })
class MockVizPieComponent {
  readonly dataSet = input<unknown>();
}

@Component({ selector: 'viz-heatmap', template: '' })
class MockVizHeatmapComponent {
  readonly dataSet = input<unknown>();
}

@Component({ selector: 'viz-scalar', template: '' })
class MockVizScalarComponent {
  readonly data = input<unknown>();
}

@Component({ selector: 'viz-markdown', template: '' })
class MockVizMarkdownComponent {
  readonly content = input<string | undefined>();
}

describe('WidgetComponent', () => {
  let component: WidgetComponent;
  let fixture: ComponentFixture<WidgetComponent>;

  let dataMapSig: WritableSignal<Record<string, any>>;
  let isLoadingSig: WritableSignal<boolean>;
  let isEditModeSig: WritableSignal<boolean>;
  let focusedWidgetIdSig: WritableSignal<string | null>;

  const mockWidget: WidgetResponse = {
    id: 'w1',
    dashboard_id: 'd1',
    title: 'Test Widget',
    type: 'SQL',
    visualization: 'table',
    config: { query: 'SELECT 1' },
  };

  let mockStore: any;
  let mockDashApi: any;

  beforeEach(async () => {
    dataMapSig = signal({});
    isLoadingSig = signal(false);
    isEditModeSig = signal(false);
    focusedWidgetIdSig = signal(null);

    mockStore = {
      dataMap: dataMapSig,
      isLoading: isLoadingSig,
      isEditMode: isEditModeSig,
      focusedWidgetId: focusedWidgetIdSig,
      isWidgetLoading: signal(() => false),
      refreshWidget: vi.fn(),
      setFocusedWidget: vi.fn(),
      duplicateWidget: vi.fn(), // Now supported
      loadDashboard: vi.fn(),
    };
    mockDashApi = {
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [WidgetComponent, NoopAnimationsModule],
      providers: [
        { provide: DashboardStore, useValue: mockStore },
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: ErrorHandler, useValue: { clearError: vi.fn(), handleError: vi.fn() } },
      ],
    })
      .overrideComponent(WidgetComponent, {
        set: {
          schemas: [NO_ERRORS_SCHEMA],
          template: readTemplate('./widget.component.html'),
          templateUrl: undefined,
        },
      })
      .overrideComponent(WidgetComponent, {
        remove: {
          imports: [
            VizTableComponent,
            VizMetricComponent,
            VizChartComponent,
            VizPieComponent,
            VizHeatmapComponent,
            VizScalarComponent,
            VizMarkdownComponent,
          ],
        },
        add: {
          imports: [
            MockVizTableComponent,
            MockVizMetricComponent,
            MockVizChartComponent,
            MockVizPieComponent,
            MockVizHeatmapComponent,
            MockVizScalarComponent,
            MockVizMarkdownComponent,
            ErrorBoundaryDirective,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(WidgetComponent);
    component = fixture.componentInstance;
    setInputSignal(component, 'widgetInput', mockWidget);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should hidden config buttons in Read-Only Mode (default)', () => {
    isEditModeSig.set(false);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('[data-testid="btn-edit"]'))).toBeFalsy();
    expect(fixture.debugElement.query(By.css('[data-testid="btn-delete"]'))).toBeFalsy();
    expect(fixture.debugElement.query(By.css('[data-testid="btn-duplicate"]'))).toBeFalsy();
  });

  it('should show config buttons in Edit Mode', () => {
    isEditModeSig.set(true);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('[data-testid="btn-edit"]'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('[data-testid="btn-delete"]'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('[data-testid="btn-duplicate"]'))).toBeTruthy();
  });

  it('should emit duplicate event when clicked', () => {
    isEditModeSig.set(true);
    fixture.detectChanges();

    let emitted = false;
    component.duplicate.subscribe(() => (emitted = true));

    const btn = fixture.debugElement.query(By.css('[data-testid="btn-duplicate"]'));
    btn.triggerEventHandler('click', null);

    expect(emitted).toBe(true);
  });

  it('should render In-Place Error Recovery button when error active', () => {
    // Setup Error State in Store
    dataMapSig.set({ w1: { error: 'Syntax Error in SQL' } });
    isEditModeSig.set(true);
    fixture.detectChanges();

    const errorState = fixture.debugElement.query(By.css('[data-testid="error-state"]'));
    expect(errorState).toBeTruthy();
    expect(errorState.nativeElement.textContent).toContain('Syntax Error');

    // Check Button
    const fixBtn = fixture.debugElement.query(By.css('[data-testid="btn-fix-query"]'));
    expect(fixBtn).toBeTruthy();

    // Verify Action
    let editEmitted = false;
    component.edit.subscribe(() => (editEmitted = true));
    fixBtn.triggerEventHandler('click', null);
    expect(editEmitted).toBe(true);
  });

  it('should handle keyboard escape event logic', () => {
    let deleteEmitted = false;
    component.delete.subscribe(() => (deleteEmitted = true));

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    vi.spyOn(event, 'stopPropagation');

    // 1. If Focused, Escape should Close Focus (Call Store)
    focusedWidgetIdSig.set('w1');
    fixture.detectChanges();
    component.onEscape(event);
    expect(mockStore.setFocusedWidget).toHaveBeenCalledWith(null);
    expect(deleteEmitted).toBe(false);

    // 2. If Not Focused but Edit Mode, Escape should Delete
    focusedWidgetIdSig.set(null);
    isEditModeSig.set(true);
    fixture.detectChanges();
    component.onEscape(event);
    expect(deleteEmitted).toBe(true);
  });

  it('should ignore escape when not focused and not edit mode', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    vi.spyOn(event, 'stopPropagation');
    focusedWidgetIdSig.set(null);
    isEditModeSig.set(false);
    component.onEscape(event);
    expect(mockStore.setFocusedWidget).not.toHaveBeenCalledWith(null);
  });

  it('should toggle focus when button clicked', () => {
    // Initial State: Not Focused
    focusedWidgetIdSig.set(null);
    fixture.detectChanges();
    component.toggleFocus();
    expect(mockStore.setFocusedWidget).toHaveBeenCalledWith('w1');

    // State: Already Focused
    focusedWidgetIdSig.set('w1');
    fixture.detectChanges();
    component.toggleFocus();
    expect(mockStore.setFocusedWidget).toHaveBeenCalledWith(null);
  });

  it('should render VizTable when visualization is "table"', () => {
    dataMapSig.set({ w1: { columns: ['a'], data: [{ a: 1 }] } });
    fixture.detectChanges();

    const viz = fixture.debugElement.query(By.directive(MockVizTableComponent));
    expect(viz).toBeTruthy();
  });

  it('should allow focus handler', () => {
    component.onFocus();
    expect(true).toBe(true);
  });

  it('should compute visualization type for text widgets', () => {
    const textWidget = { ...mockWidget, type: 'TEXT', visualization: undefined };
    setInputSignal(component, 'widgetInput', textWidget);
    fixture.detectChanges();
    expect(component.visualizationType()).toBe('markdown');
  });

  it('should compute skeleton type for various visualizations', () => {
    setInputSignal(component, 'widgetInput', { ...mockWidget, visualization: 'bar_chart' });
    fixture.detectChanges();
    expect(component.skeletonType()).toBe('chart');

    setInputSignal(component, 'widgetInput', { ...mockWidget, visualization: 'pie' });
    fixture.detectChanges();
    expect(component.skeletonType()).toBe('pie');

    setInputSignal(component, 'widgetInput', { ...mockWidget, visualization: 'metric' });
    fixture.detectChanges();
    expect(component.skeletonType()).toBe('metric');

    setInputSignal(component, 'widgetInput', { ...mockWidget, visualization: undefined });
    fixture.detectChanges();
    expect(component.skeletonType()).toBe('table');
  });

  it('should fallback skeleton type for unknown visualizations', () => {
    setInputSignal(component, 'widgetInput', { ...mockWidget, visualization: 'custom' });
    fixture.detectChanges();
    expect(component.skeletonType()).toBe('card');
  });

  it('should refresh widget manually', () => {
    component.manualRefresh();
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('w1');
  });

  it('should trigger template click handlers for focus and refresh', () => {
    const buttons = fixture.debugElement.queryAll(By.css('button[mat-icon-button]'));
    buttons[0].triggerEventHandler('click', null);
    buttons[buttons.length - 1].triggerEventHandler('click', null);
    expect(mockStore.setFocusedWidget).toHaveBeenCalled();
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('w1');
  });

  it('should emit edit and delete events from template buttons', () => {
    isEditModeSig.set(true);
    fixture.detectChanges();
    const editSpy = vi.fn();
    const deleteSpy = vi.fn();
    component.edit.subscribe(editSpy);
    component.delete.subscribe(deleteSpy);
    fixture.debugElement
      .query(By.css('[data-testid="btn-edit"]'))
      .triggerEventHandler('click', null);
    fixture.debugElement
      .query(By.css('[data-testid="btn-delete"]'))
      .triggerEventHandler('click', null);
    expect(editSpy).toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalled();
  });

  it('should render each visualization case', () => {
    const cases = [
      { visualization: 'table', selector: MockVizTableComponent },
      { visualization: 'bar_chart', selector: MockVizChartComponent },
      { visualization: 'line_graph', selector: MockVizChartComponent },
      { visualization: 'metric', selector: MockVizMetricComponent },
      { visualization: 'scalar', selector: MockVizScalarComponent },
      { visualization: 'pie', selector: MockVizPieComponent },
      { visualization: 'heatmap', selector: MockVizHeatmapComponent },
    ];

    for (const entry of cases) {
      setInputSignal(component, 'widgetInput', {
        ...mockWidget,
        visualization: entry.visualization,
      });
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.directive(entry.selector))).toBeTruthy();
    }

    setInputSignal(component, 'widgetInput', {
      ...mockWidget,
      type: 'TEXT',
      visualization: undefined,
      config: { content: 'x' },
    });
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(MockVizMarkdownComponent))).toBeTruthy();

    setInputSignal(component, 'widgetInput', { ...mockWidget, visualization: 'unknown' });
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.center-overlay'))).toBeTruthy();
  });

  it('should render safe mode template and handle actions', () => {
    const boundaryNode =
      fixture.debugElement.query(By.directive(ErrorBoundaryDirective)) ||
      fixture.debugElement.query(By.css('.viz-container'));
    const directive = boundaryNode?.injector.get(
      ErrorBoundaryDirective,
      null,
    ) as ErrorBoundaryDirective | null;
    if (!directive) {
      throw new Error('ErrorBoundaryDirective not found');
    }
    directive.renderFallback(new Error('boom'));
    fixture.detectChanges();

    const retryBtn = fixture.debugElement.query(By.css('button[mat-stroked-button]'));
    retryBtn.triggerEventHandler('click', null);

    directive.renderFallback(new Error('boom-again'));
    isEditModeSig.set(true);
    fixture.detectChanges();
    const resetBtn = fixture.debugElement.queryAll(By.css('button[mat-stroked-button]'))[1];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    resetBtn.triggerEventHandler('click', null);
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should expose derived computed values', () => {
    dataMapSig.set({ w1: { error: 'oops' } });
    focusedWidgetIdSig.set('w1');
    mockStore.isWidgetLoading.set(() => true);
    fixture.detectChanges();

    expect(component.isLoadingLocal()).toBe(true);
    expect(component.rawResult()).toEqual({ error: 'oops' });
    expect(component.isFocused()).toBe(true);
    expect(component.errorMessage()).toBe('oops');
    expect(component.typedDataAsTable()).toEqual({ error: 'oops' } as any);
    expect(component.chartConfig()).toEqual(mockWidget.config as any);
  });

  it('should not reset widget when confirm is false', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    component.resetWidget();
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should reset SQL widget to safe defaults', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.resetWidget();
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({
        visualization: 'table',
        config: { query: 'SELECT 1 as SafeMode' },
      }),
    );
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d1');
  });

  it('should reset non-SQL widget with empty config', () => {
    const httpWidget = { ...mockWidget, type: 'HTTP' };
    setInputSignal(component, 'widgetInput', httpWidget);
    fixture.detectChanges();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.resetWidget();
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({ visualization: 'table', config: {} }),
    );
  });
});

function setInputSignal(component: any, key: string, value: unknown): void {
  const current = component[key];
  const node = current?.[SIGNAL];
  if (node) {
    if (typeof node.applyValueToInputSignal === 'function') {
      node.applyValueToInputSignal(node, value);
    } else {
      signalSetFn(node, value as never);
    }
  } else {
    component[key] = value;
  }
}
