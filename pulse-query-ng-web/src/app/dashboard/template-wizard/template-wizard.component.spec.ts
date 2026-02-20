import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TemplateWizardComponent } from './template-wizard.component';
import {
  DashboardsService,
  ExecutionService,
  TemplatesService,
  TemplateResponse,
} from '../../api-client';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ReactiveFormsModule } from '@angular/forms';
import { vi } from 'vitest';

describe('TemplateWizardComponent', () => {
  let component: TemplateWizardComponent;
  let fixture: ComponentFixture<TemplateWizardComponent>;

  let mockDashApi: any;
  let mockExecApi: any;
  let mockTemplatesApi: any;
  let mockDialogRef: any;

  const mockTemplates: TemplateResponse[] = [
    { id: 't1', title: 'Admissions', category: 'Operational', sql_template: 'SELECT 1' },
    { id: 't2', title: 'Revenue', category: 'Financial', sql_template: 'SELECT 2' },
  ];

  beforeEach(async () => {
    mockDashApi = {
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn(),
      deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn(),
    };
    mockExecApi = {
      refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn(),
    };
    mockTemplatesApi = {
      listTemplatesApiV1TemplatesGet: vi.fn(),
    };
    mockDialogRef = { close: vi.fn() };

    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
      of({
        id: 'draft-1',
        dashboard_id: 'dash-1',
        title: 'Draft',
        type: 'SQL',
        visualization: 'table',
        config: {},
      }),
    );
    mockTemplatesApi.listTemplatesApiV1TemplatesGet.mockReturnValue(of(mockTemplates));

    await TestBed.configureTestingModule({
      imports: [TemplateWizardComponent, NoopAnimationsModule, ReactiveFormsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: ExecutionService, useValue: mockExecApi },
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

  it('should validate form and enable/disable next button', () => {
    expect(component.selectionForm.invalid).toBe(false); // Initially valid as mode is predefined

    component.selectTemplate(mockTemplates[0]);
    expect(component.selectionForm.valid).toBe(true);

    component.selectionForm.patchValue({ mode: 'custom', rawSql: '' });
    expect(component.selectionForm.invalid).toBe(true);

    component.selectionForm.patchValue({ rawSql: 'SELECT 1' });
    expect(component.selectionForm.valid).toBe(true);
  });

  it('should parse parameters correctly', () => {
    component.selectionForm.patchValue({ mode: 'custom', rawSql: 'SELECT {{var}}' });
    component.parseParams();
    expect(component.paramsSchema()).toEqual({});
    expect(component.paramsValid()).toBe(true);
  });

  it('should save widget with template title', () => {
    component.templates.set(mockTemplates);
    component.selectTemplate(mockTemplates[0]);
    // Ensure the final SQL signal is set as that is what saveWidget uses
    component.finalSql.set('SELECT 1');

    // Must invoke create first to set draft ID if not already set by ngOnInit
    if (!component.draftWidgetId()) {
      (component as any).createDraftWidget();
    }

    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));

    component.saveWidget();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        title: 'Admissions',
        config: { query: 'SELECT 1' },
      }),
    );
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });

  it('should save widget with default title when template missing', () => {
    component.selectionForm.patchValue({ mode: 'predefined', templateId: 'missing' });
    component.finalSql.set('SELECT 1');
    component.draftWidgetId.set('draft-1');

    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));

    component.saveWidget();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        title: 'Custom SQL Widget',
        config: { query: 'SELECT 1' },
      }),
    );
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
    component.updateSearch({ target: { value: 'adm' } } as any);
    vi.advanceTimersByTime(300);
    expect(loadSpy).toHaveBeenCalled();
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
  });

  it('should mark params invalid on status INVALID', () => {
    component.handleStatusChange('INVALID');
    expect(component.paramsValid()).toBe(false);
  });

  it('should render preview and execute draft', () => {
    component.draftWidgetId.set('draft-1');
    component.selectionForm.patchValue({ rawSql: 'SELECT {{x}}' });
    component.paramsValue.set({ x: 5 });
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
      of({ 'draft-1': { data: [] } }),
    );

    component.renderPreview();

    expect(component.finalSql()).toBe('SELECT 5');
    expect(component.executionResult()).toEqual({ data: [] });
  });

  it('should render preview with empty SQL when rawSql missing', () => {
    component.draftWidgetId.set(null);
    component.selectionForm.patchValue({ rawSql: null });
    component.paramsValue.set({});

    component.renderPreview();

    expect(component.finalSql()).toBe('');
  });

  it('should handle executeDraft error', () => {
    component.draftWidgetId.set('draft-1');
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => new Error('fail')),
    );

    (component as any).executeDraft('SELECT 1');

    expect(component.isRunning()).toBe(false);
    expect(component.executionResult()).toEqual({ error: 'Failed to execute query' });
  });

  it('should no-op executeDraft when no draft', () => {
    component.draftWidgetId.set(null);
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockClear();

    (component as any).executeDraft('SELECT 1');

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should no-op save when no draft', () => {
    component.draftWidgetId.set(null);
    component.saveWidget();
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should save widget with default title for custom mode', () => {
    component.draftWidgetId.set('draft-1');
    component.selectionForm.patchValue({ mode: 'custom', rawSql: 'SELECT 1' });
    component.finalSql.set('SELECT 1');
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));

    component.saveWidget();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({ title: 'Custom SQL Widget' }),
    );
  });

  it('should cancel and delete draft when present', () => {
    component.draftWidgetId.set('draft-1');
    mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete.mockReturnValue(of({}));
    component.cancel();
    expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).toHaveBeenCalledWith(
      'draft-1',
    );
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });

  it('should cancel and close when no draft', () => {
    component.draftWidgetId.set(null);
    component.cancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });

  it('should parse params for predefined schema', () => {
    component.selectionForm.patchValue({ mode: 'predefined' });
    component.paramsSchema.set({ properties: {} });
    component.parseParams();
    expect(component.paramsValid()).toBe(true);
  });

  it('should keep params invalid when schema has fields', () => {
    component.selectionForm.patchValue({ mode: 'predefined' });
    component.paramsValid.set(false);
    component.paramsSchema.set({ properties: { a: { type: 'string' } } });
    component.parseParams();
    expect(component.paramsValid()).toBe(false);
  });

  it('should highlight SQL and sync scroll', () => {
    component.finalSql.set("SELECT * FROM t WHERE a = 'x' AND b = 5");
    const html = component.highlightedSql() as any;
    expect(html).toBeTruthy();

    const highlight = document.createElement('div');
    highlight.classList.add('highlight-layer');
    const parent = document.createElement('div');
    parent.appendChild(highlight);
    const textarea = document.createElement('textarea');
    parent.appendChild(textarea);
    textarea.scrollTop = 10;
    textarea.scrollLeft = 5;

    component.syncScroll({ target: textarea } as any);
    expect(highlight.scrollTop).toBe(10);
    expect(highlight.scrollLeft).toBe(5);
  });

  it('should highlight empty SQL safely', () => {
    component.finalSql.set('');
    const html = component.highlightedSql() as any;
    expect(html).toBeTruthy();
  });

  it('should no-op syncScroll when highlight missing', () => {
    const parent = document.createElement('div');
    const textarea = document.createElement('textarea');
    parent.appendChild(textarea);

    component.syncScroll({ target: textarea } as any);
    expect(true).toBe(true);
  });

  it('should unsubscribe on destroy', () => {
    (component as any).searchSub = { unsubscribe: vi.fn() };
    (component as any).modeSub = { unsubscribe: vi.fn() };
    component.ngOnDestroy();
    expect((component as any).searchSub.unsubscribe).toHaveBeenCalled();
    expect((component as any).modeSub.unsubscribe).toHaveBeenCalled();
  });

  it('should cast results to table data', () => {
    const res = { columns: [], data: [] };
    expect(component.asTableData(res)).toBe(res as any);
  });
});
