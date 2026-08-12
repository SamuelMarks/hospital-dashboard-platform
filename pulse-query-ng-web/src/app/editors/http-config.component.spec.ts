import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpConfigComponent } from './http-config.component';
import { DashboardsService, ExecutionService } from '../api-client';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

describe('HttpConfigComponent', () => {
  let component: HttpConfigComponent;
  let fixture: ComponentFixture<HttpConfigComponent>;

  let mockDashboardsApi: any;
  let mockExecutionApi: any;

  let initialConfigSig: any;

  beforeEach(async () => {
    mockDashboardsApi = {
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn(),
    };
    mockExecutionApi = {
      refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [HttpConfigComponent],
      providers: [
        { provide: DashboardsService, useValue: mockDashboardsApi },
        { provide: ExecutionService, useValue: mockExecutionApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HttpConfigComponent);
    component = fixture.componentInstance;

    (component as any).dashboardId = signal('d1');
    (component as any).widgetId = signal('w1');
    initialConfigSig = signal({
      method: 'POST',
      url: 'https://api.test.com',
      params: { q: 'search' },
      headers: { 'X-Custom': '123' },
      body: { someProperty: 123 },
      meta_forward_auth: true,
    });
    (component as any).initialConfig = initialConfigSig;

    fixture.detectChanges();
  });

  it('should create and hydrate form', () => {
    expect(component).toBeTruthy();
    const val = component.formModel();
    expect(val.method).toBe('POST');
    expect(val.url).toBe('https://api.test.com');
    expect(val.forward_auth).toBe(true);

    expect(val.body).toContain('"someProperty": 123');

    expect(val.params.length).toBe(1);
    expect(val.params[0].key).toBe('q');
    expect(val.params[0].value).toBe('search');

    expect(val.headers.length).toBe(1);
    expect(val.headers[0].key).toBe('X-Custom');
    expect(val.headers[0].value).toBe('123');
  });

  it('should validate URL format', () => {
    const urlControl = component.form.url;

    component.formModel.update((m) => ({ ...m, url: 'invalid-url' }));
    fixture.detectChanges();
    expect(urlControl().valid()).toBe(false);

    component.formModel.update((m) => ({ ...m, url: 'http://valid.com' }));
    fixture.detectChanges();
    expect(urlControl().valid()).toBe(true);
  });

  it('should validate JSON body', () => {
    const bodyControl = component.form.body;

    component.formModel.update((m) => ({ ...m, body: '{ invalid: json }' }));
    fixture.detectChanges();
    expect(bodyControl().valid()).toBe(false);
    expect(
      bodyControl()
        .errors()
        .some((e) => e.kind === 'invalidJson'),
    ).toBe(true);

    component.formModel.update((m) => ({ ...m, body: '{ "valid": "json" }' }));
    fixture.detectChanges();
    expect(bodyControl().valid()).toBe(true);

    component.formModel.update((m) => ({ ...m, body: '' }));
    fixture.detectChanges();
    expect(bodyControl().valid()).toBe(true);
  });

  it('should add and remove parameters dynamically', () => {
    component.addItem('params');
    fixture.detectChanges();
    expect(component.formModel().params.length).toBe(2);

    component.formModel.update((m) => {
      const newParams = [...m.params];
      newParams[1] = { key: 'page', value: '2' };
      return { ...m, params: newParams };
    });
    fixture.detectChanges();

    component.removeItem('params', 0);
    fixture.detectChanges();
    expect(component.formModel().params.length).toBe(1);
    expect(component.formModel().params[0].key).toBe('page');
    expect(component.formModel().params[0].value).toBe('2');
  });

  it('should add and remove headers dynamically', () => {
    component.addItem('headers');
    fixture.detectChanges();
    expect(component.formModel().headers.length).toBe(2);

    component.removeItem('headers', 0);
    fixture.detectChanges();
    expect(component.formModel().headers.length).toBe(1);
  });

  describe('saveAndTest', () => {
    it('should update widget and refresh dashboard on success', () => {
      mockDashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));
      mockExecutionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
        of({
          w1: { status: 200, data: { success: true } },
        }),
      );

      vi.spyOn(component.configChange, 'emit');

      const validBody = '{ "test": true }';
      component.formModel.update((m) => ({ ...m, body: validBody }));
      fixture.detectChanges();

      component.saveAndTest();

      expect(component.isRunning()).toBe(false);

      const expectedConfig = {
        method: 'POST',
        url: 'https://api.test.com',
        params: { q: 'search' },
        headers: { 'X-Custom': '123' },
        body: { test: true },
        meta_forward_auth: true,
      };

      expect(mockDashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({ config: expectedConfig }),
      );
      expect(
        mockExecutionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost,
      ).toHaveBeenCalledWith('d1');

      expect(component.result()).toEqual({ status: 200, data: { success: true } });
      expect(component.configChange.emit).toHaveBeenCalled();
    });

    it('should block execution if form is invalid', () => {
      component.formModel.update((m) => ({ ...m, url: '' }));
      fixture.detectChanges();
      component.saveAndTest();

      expect(
        mockDashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut,
      ).not.toHaveBeenCalled();
    });

    it('should handle save errors', () => {
      mockDashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
        throwError(() => new Error('save fail')),
      );
      component.saveAndTest();
      expect(component.isRunning()).toBe(false);
      expect((component.result() as Record<string, unknown>)?.['error']).toBe('Save failed');
    });

    it('should handle execution errors', () => {
      mockDashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));
      mockExecutionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
        throwError(() => new Error('exec fail')),
      );
      component.saveAndTest();
      expect((component.result() as Record<string, unknown>)?.['error']).toBe('Run failed');
    });

    it('should return fallback when no data for widget', () => {
      mockDashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));
      mockExecutionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
        of({}),
      );
      component.saveAndTest();
      expect((component.result() as Record<string, unknown>)?.['info']).toContain('No Data');
    });

    it('should send null body when body field is empty', () => {
      mockDashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));
      mockExecutionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
        of({}),
      );
      component.formModel.update((m) => ({ ...m, body: '' }));
      component.saveAndTest();
      expect(mockDashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({ config: expect.objectContaining({ body: null }) }),
      );
    });
  });

  it('should mark field invalid after touch', () => {
    const urlControl = component.form.url;
    urlControl().markAsTouched();
    component.formModel.update((m) => ({ ...m, url: 'bad' }));
    fixture.detectChanges();
    expect(component.isFieldInvalid(urlControl)).toBe(true);
  });

  it('should handle hydrate when config body is non-serializable', () => {
    initialConfigSig.set({
      body: {
        toJSON: () => {
          throw new Error('fail');
        },
      },
    });
    fixture.detectChanges();
    expect(component.formModel().body).toContain('[object Object]');
  });

  it('should no-op hydrate when config is null', () => {
    (component as any).parseConfig(null);
    expect(component.formModel().method).toBe('POST');
  });

  it('should leave body empty when config has no body', () => {
    initialConfigSig.set({ method: 'GET', url: 'https://example.com', params: {}, headers: {} });
    fixture.detectChanges();
    expect(component.formModel().body).toBe('');
  });

  it('should omit empty keys when building object', () => {
    const obj = (component as any).arrToObj([
      { key: '', value: 'x' },
      { key: 'a', value: '1' },
    ]);
    expect(obj).toEqual({ a: '1' });
  });

  it('should render preview fallback when no result', () => {
    const preview = fixture.debugElement.query(By.css('.preview-panel'));
    expect(preview.nativeElement.textContent).toContain('Save and Test to see response');
  });

  it('should render preview json when result is present', () => {
    component.result.set({ ok: true });
    fixture.detectChanges();
    const preview = fixture.debugElement.query(By.css('.preview-panel'));
    expect(preview.nativeElement.textContent).toContain('"ok": true');
  });

  it('should trigger save via template button', () => {
    const saveSpy = vi.spyOn(component, 'saveAndTest').mockImplementation(() => {});
    component.formModel.update((m) => ({ ...m, url: 'https://api.test.com' }));
    fixture.detectChanges();
    const saveBtn = fixture.debugElement
      .queryAll(By.css('button'))
      .find((btn) => btn.nativeElement.textContent.includes('Save & Test'))!;
    saveBtn.triggerEventHandler('click', null);
    expect(saveSpy).toHaveBeenCalled();
  });

  it('should add and remove items via template buttons', () => {
    fixture.detectChanges();
    const addParamBtn = fixture.debugElement
      .queryAll(By.css('button'))
      .find((btn) => btn.nativeElement.textContent.includes('Add Parameter'))!;
    addParamBtn.triggerEventHandler('click', null);
    fixture.detectChanges();
    expect(component.formModel().params.length).toBeGreaterThan(1);

    const removeParamBtn = fixture.debugElement.queryAll(By.css('button[mat-icon-button]'))[0];
    removeParamBtn.triggerEventHandler('click', null);
    fixture.detectChanges();

    const addHeaderBtn = fixture.debugElement
      .queryAll(By.css('button'))
      .find((btn) => btn.nativeElement.textContent.includes('Add Header'))!;
    addHeaderBtn.triggerEventHandler('click', null);
    fixture.detectChanges();
    expect(component.formModel().headers.length).toBeGreaterThan(1);

    const removeHeaderBtn = fixture.debugElement
      .queryAll(By.css('button[mat-icon-button]'))
      .find((btn) => btn.nativeElement.getAttribute('aria-label') === 'Remove Header')!;
    removeHeaderBtn.triggerEventHandler('click', null);
    fixture.detectChanges();
  });

  it('should show spinner when running', () => {
    component.isRunning.set(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('mat-spinner'))).toBeTruthy();
  });
});
