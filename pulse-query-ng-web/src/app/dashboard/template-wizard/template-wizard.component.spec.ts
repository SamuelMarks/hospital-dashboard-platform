/**
 * @fileoverview Unit tests for `TemplateWizardComponent`.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TemplateWizardComponent } from './template-wizard.component';
import { AiService, DashboardsService, TemplatesService, TemplateResponse } from '../../api-client';
import { TemplateConfigurationService } from '../template-configuration.service';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ReactiveFormsModule } from '@angular/forms';
import { vi, type Mock } from 'vitest';

describe('TemplateWizardComponent', () => {
  let component: TemplateWizardComponent;
  let fixture: ComponentFixture<TemplateWizardComponent>;

  let mockDashApi: {
    createWidgetApiV1DashboardsDashboardIdWidgetsPost: Mock;
  };
  let mockAiApi: {
    executeSqlPreviewApiV1AiExecutePost: Mock;
  };
  let mockTemplatesApi: {
    listTemplatesApiV1TemplatesGet: Mock;
  };
  let mockDialogRef: { close: Mock };

  const mockTemplates: TemplateResponse[] = [
    {
      id: 't1',
      title: 'Admissions Trend',
      category: 'Operational',
      sql_template: 'SELECT 1 GROUP BY d',
    },
    { id: 't2', title: 'Revenue', category: 'Financial', sql_template: 'SELECT 2' },
  ];

  beforeEach(async () => {
    mockDashApi = {
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn().mockReturnValue(
        of({
          id: 'w-created',
          dashboard_id: 'dash-1',
          title: 'Admissions Trend',
          type: 'SQL',
          visualization: 'bar_chart',
          config: {},
        }),
      ),
    };
    mockAiApi = {
      executeSqlPreviewApiV1AiExecutePost: vi
        .fn()
        .mockReturnValue(of({ data: [{ v: 1 }], columns: ['v'], error: null })),
    };
    mockTemplatesApi = {
      listTemplatesApiV1TemplatesGet: vi.fn().mockReturnValue(of(mockTemplates)),
    };
    mockDialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [TemplateWizardComponent, NoopAnimationsModule, ReactiveFormsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        TemplateConfigurationService,
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: AiService, useValue: mockAiApi },
        { provide: TemplatesService, useValue: mockTemplatesApi },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { dashboardId: 'dash-1' } },
      ],
    })
      .overrideComponent(TemplateWizardComponent, {
        set: { template: '<div></div>', schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TemplateWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('does not create any draft widget on initialization', () => {
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).not.toHaveBeenCalled();
  });

  it('should validate form and enable/disable next button', () => {
    expect(component.selectionValid()).toBe(false);

    component.selectTemplate(mockTemplates[0]!);
    expect(component.selectionValid()).toBe(true);

    component.formModel.update((m) => ({ ...m, mode: 'custom', rawSql: '' }));
    fixture.detectChanges();
    expect(component.selectionValid()).toBe(false);

    component.formModel.update((m) => ({ ...m, rawSql: 'SELECT 1' }));
    fixture.detectChanges();
    expect(component.selectionValid()).toBe(true);
  });

  it('should parse parameters correctly for custom and predefined modes', () => {
    component.formModel.update((m) => ({ ...m, mode: 'custom', rawSql: 'SELECT {{var}}' }));
    fixture.detectChanges();
    component.parseParams();
    expect(component.paramsSchema()).toEqual({});
    expect(component.paramsValid()).toBe(true);

    component.formModel.update((m) => ({ ...m, mode: 'predefined' }));
    component.paramsSchema.set({ properties: {} });
    component.paramsValid.set(false);
    component.parseParams();
    expect(component.paramsValid()).toBe(true);

    component.paramsValid.set(false);
    component.paramsSchema.set({ properties: { a: { type: 'string' } } });
    component.parseParams();
    expect(component.paramsValid()).toBe(false);
  });

  it('should create widget with inferred template visualization on saveWidget()', () => {
    component.templates.set(mockTemplates);
    component.selectTemplate(mockTemplates[0]!);
    component.finalSql.set('SELECT 1 GROUP BY d');

    component.saveWidget();

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'dash-1',
      {
        title: 'Admissions Trend',
        type: 'SQL',
        visualization: 'bar_chart',
        config: { query: 'SELECT 1 GROUP BY d' },
      },
    );
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });

  it('should save widget with default title when template is not found or mode is custom', () => {
    component.formModel.update((m) => ({ ...m, mode: 'predefined', templateId: 'missing' }));
    component.finalSql.set('SELECT 1');

    component.saveWidget();

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'dash-1',
      {
        title: 'Custom SQL Widget',
        type: 'SQL',
        visualization: 'table',
        config: { query: 'SELECT 1' },
      },
    );

    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockClear();
    component.formModel.update((m) => ({ ...m, mode: 'custom', rawSql: 'SELECT 2' }));
    component.finalSql.set('SELECT 2');
    component.saveWidget();

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'dash-1',
      expect.objectContaining({
        title: 'Custom SQL Widget',
        config: { query: 'SELECT 2' },
      }),
    );
  });

  it('should no-op saveWidget when finalSql is blank', () => {
    component.finalSql.set('   ');
    component.saveWidget();
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).not.toHaveBeenCalled();
  });

  it('should toggle category and reload templates', () => {
    const loadSpy = vi.spyOn(component, 'loadTemplates');
    component.toggleCategory('Operational');
    expect(component.selectedCategory()).toBe('Operational');
    expect(loadSpy).toHaveBeenCalled();
    component.toggleCategory('Operational');
    expect(component.selectedCategory()).toBeNull();
  });

  it('should update search with debounce', () => {
    vi.useFakeTimers();
    const loadSpy = vi.spyOn(component, 'loadTemplates');
    component.updateSearch({ target: { value: 'adm' } } as unknown as Event);
    vi.advanceTimersByTime(300);
    expect(loadSpy).toHaveBeenCalledWith('adm');
    vi.useRealTimers();
  });

  it('should handle loadTemplates error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockTemplatesApi.listTemplatesApiV1TemplatesGet.mockReturnValue(
      throwError(() => new Error('fail')),
    );
    component.loadTemplates('bad');
    expect(component.loadingTemplates()).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should handle form change and status', () => {
    component.handleFormChange({ a: 1 });
    expect(component.paramsValue()).toEqual({ a: 1 });

    component.handleStatusChange('VALID');
    expect(component.paramsValid()).toBe(true);

    component.handleStatusChange('INVALID');
    expect(component.paramsValid()).toBe(false);
  });

  it('should render preview via stateless AiService.executeSqlPreviewApiV1AiExecutePost', () => {
    component.formModel.update((m) => ({ ...m, rawSql: 'SELECT {{x}}' }));
    component.paramsValue.set({ x: 5 });

    component.renderPreview();

    expect(component.finalSql()).toBe('SELECT 5');
    expect(mockAiApi.executeSqlPreviewApiV1AiExecutePost).toHaveBeenCalledWith({
      sql: 'SELECT 5',
      max_rows: 100,
    });
    expect(component.executionResult()).toEqual({
      data: [{ v: 1 }],
      columns: ['v'],
      error: null,
    });
  });

  it('should handle renderPreview when SQL is empty or execution fails', () => {
    component.formModel.update((m) => ({ ...m, rawSql: '' }));
    component.paramsValue.set({});
    component.renderPreview();
    expect(component.finalSql()).toBe('');
    expect(component.executionResult()).toEqual({ data: [], columns: [] });

    mockAiApi.executeSqlPreviewApiV1AiExecutePost.mockReturnValue(
      throwError(() => new Error('fail')),
    );
    component.formModel.update((m) => ({ ...m, rawSql: 'SELECT 1' }));
    component.renderPreview();
    expect(component.isRunning()).toBe(false);
    expect(component.executionResult()).toEqual({ error: 'Failed to execute query' });
  });

  it('should close dialog without deleting anything on cancel()', () => {
    component.cancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });

  it('should highlight SQL and sync scroll', () => {
    component.finalSql.set("SELECT * FROM t WHERE a = 'x' AND b = 5");
    const html = component.highlightedSql();
    expect(html).toBeTruthy();

    component.finalSql.set('');
    expect(component.highlightedSql()).toBeTruthy();

    const highlight = document.createElement('div');
    highlight.classList.add('highlight-layer');
    const parent = document.createElement('div');
    parent.appendChild(highlight);
    const textarea = document.createElement('textarea');
    parent.appendChild(textarea);
    textarea.scrollTop = 10;
    textarea.scrollLeft = 5;

    component.syncScroll({ target: textarea } as unknown as Event);
    expect(highlight.scrollTop).toBe(10);
    expect(highlight.scrollLeft).toBe(5);

    const loneParent = document.createElement('div');
    const loneTextarea = document.createElement('textarea');
    loneParent.appendChild(loneTextarea);
    component.syncScroll({ target: loneTextarea } as unknown as Event);
  });

  it('should cast results to table data', () => {
    const res = { columns: ['a'], data: [{ a: 1 }] };
    expect(component.asTableData(res)).toEqual(res);
  });
});
