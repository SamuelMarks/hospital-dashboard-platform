import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ProvisioningService } from './provisioning.service';
import { DashboardsService, TemplateResponse, WidgetResponse } from '../api-client';
import { DashboardStore } from './dashboard.store';

describe('ProvisioningService', () => {
  let service: ProvisioningService;
  let mockDashApi: { createWidgetApiV1DashboardsDashboardIdWidgetsPost: ReturnType<typeof vi.fn> };
  let mockStore: { refreshWidget: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockDashApi = {
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
    };
    mockStore = { refreshWidget: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        ProvisioningService,
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: DashboardStore, useValue: mockStore },
      ],
    });

    service = TestBed.inject(ProvisioningService);
  });

  it('builds config with default parameter values', () => {
    const template: TemplateResponse = {
      id: 't1',
      title: 'Template',
      category: 'Ops',
      sql_template: 'SELECT * FROM t WHERE unit = {{unit}}',
      parameters_schema: { properties: { unit: { default: 'ICU_A' } } },
    };

    const config = (service as any).buildConfig(template);
    expect(config.query).toContain('ICU_A');
  });

  it('builds config when parameters schema is missing', () => {
    const template: TemplateResponse = {
      id: 't2',
      title: 'Template',
      category: 'Ops',
      sql_template: 'SELECT * FROM t WHERE unit = {{unit}}',
    };

    const config = (service as any).buildConfig(template);
    expect(config.query).toContain('{{unit}}');
  });

  it('does not replace placeholders when defaults are missing', () => {
    const template: TemplateResponse = {
      id: 't3',
      title: 'Template',
      category: 'Ops',
      sql_template: 'SELECT * FROM t WHERE unit = {{unit}}',
      parameters_schema: { properties: { unit: {} } },
    };

    const config = (service as any).buildConfig(template);
    expect(config.query).toContain('{{unit}}');
  });

  it('guesses visualization types from title/SQL heuristics', () => {
    const mk = (title: string, sql: string): TemplateResponse => ({
      id: title,
      title,
      category: 'X',
      sql_template: sql,
    });

    expect((service as any).guessVisualization(mk('Service Breakdown', 'select *'))).toBe('pie');
    expect((service as any).guessVisualization(mk('Trend Over Time', 'select * group by dt'))).toBe(
      'bar_chart',
    );
    expect((service as any).guessVisualization(mk('Risk Rate', 'select *'))).toBe('scalar');
    expect((service as any).guessVisualization(mk('Gap Analysis', 'select *'))).toBe('metric');
    expect((service as any).guessVisualization(mk('Raw Table', 'select *'))).toBe('table');
  });

  it('provisions widget and refreshes it', () => {
    const template: TemplateResponse = {
      id: 't1',
      title: 'Template',
      category: 'Ops',
      sql_template: 'SELECT 1',
      parameters_schema: {},
    };

    const created: WidgetResponse = { id: 'w1', dashboard_id: 'd1' } as WidgetResponse;
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(created));

    service.provisionWidget(template, 'd1', { x: 2, y: 3 }).subscribe((widget) => {
      expect(widget).toBe(created);
    });

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalled();
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('w1');
  });
});
