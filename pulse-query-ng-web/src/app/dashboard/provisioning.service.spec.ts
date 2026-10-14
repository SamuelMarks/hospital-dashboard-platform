/**
 * @fileoverview Unit tests for `ProvisioningService`.
 */

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi, type Mock } from 'vitest';
import { ProvisioningService } from './provisioning.service';
import { DashboardsService, TemplateResponse, WidgetResponse } from '../api-client';
import { DashboardStore } from './dashboard.store';
import { TemplateConfigurationService } from './template-configuration.service';

describe('ProvisioningService', () => {
  let service: ProvisioningService;
  let mockDashApi: { createWidgetApiV1DashboardsDashboardIdWidgetsPost: Mock };
  let mockStore: { refreshWidget: Mock };

  beforeEach(() => {
    mockDashApi = {
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
    };
    mockStore = { refreshWidget: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        ProvisioningService,
        TemplateConfigurationService,
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: DashboardStore, useValue: mockStore },
      ],
    });

    service = TestBed.inject(ProvisioningService);
  });

  it('provisions widget with interpolated default parameters and custom position', () => {
    const template: TemplateResponse = {
      id: 't1',
      title: 'Service Breakdown',
      category: 'Ops',
      sql_template: 'SELECT * FROM t WHERE unit = {{unit}}',
      parameters_schema: { properties: { unit: { default: 'ICU_A' } } },
    };

    const created: WidgetResponse = {
      id: 'w1',
      dashboard_id: 'd1',
      title: 'Service Breakdown',
      type: 'SQL',
      visualization: 'pie',
      config: {},
    };
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(created));

    service.provisionWidget(template, 'd1', { x: 2, y: 3 }).subscribe((widget) => {
      expect(widget).toBe(created);
    });

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      {
        title: 'Service Breakdown',
        type: 'SQL',
        visualization: 'pie',
        config: {
          query: 'SELECT * FROM t WHERE unit = ICU_A',
          x: 2,
          y: 3,
          w: 6,
          h: 4,
        },
      },
    );
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('w1');
  });

  it('provisions widget with default position (0, 0) when position argument is omitted', () => {
    const template: TemplateResponse = {
      id: 't2',
      title: 'Raw Table',
      category: 'Ops',
      sql_template: 'SELECT 1',
      parameters_schema: {},
    };

    const created: WidgetResponse = {
      id: 'w2',
      dashboard_id: 'd1',
      title: 'Raw Table',
      type: 'SQL',
      visualization: 'table',
      config: {},
    };
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(created));

    service.provisionWidget(template, 'd1').subscribe((widget) => {
      expect(widget).toBe(created);
    });

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({
        visualization: 'table',
        config: expect.objectContaining({ x: 0, y: 0, query: 'SELECT 1' }),
      }),
    );
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('w2');
  });
});
