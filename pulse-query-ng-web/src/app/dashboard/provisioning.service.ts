/**
 * @fileoverview Service responsible for instantiating dashboard widgets from templates.
 *
 * Delegates default parameter extraction, SQL interpolation, and visualization heuristics
 * to `TemplateConfigurationService` and persists the resulting widget via `DashboardsService`.
 */

import { Service, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  DashboardsService,
  TemplateResponse,
  WidgetCreateSql,
  WidgetResponse,
} from '../api-client';
import { DashboardStore } from '../dashboard/dashboard.store';
import { TemplateConfigurationService } from './template-configuration.service';

/**
 * Two-dimensional grid coordinate for placing a newly provisioned widget.
 */
export interface GridPosition {
  /** Horizontal grid column offset. */
  x: number;
  /** Vertical grid row offset. */
  y: number;
}

/**
 * Service responsible for instantiating Widgets from Templates using default parameters.
 */
@Service()
export class ProvisioningService {
  /** Generated OpenAPI dashboards service client. */
  private readonly dashboardApi = inject(DashboardsService);

  /** Active dashboard state store. */
  private readonly store = inject(DashboardStore);

  /** Shared template configuration and SQL interpolation service. */
  private readonly templateConfig = inject(TemplateConfigurationService);

  /**
   * Instantiates a template into the specified dashboard using its default parameter values.
   *
   * @param template - The source template definition.
   * @param dashboardId - The target dashboard UUID.
   * @param position - Optional grid position `{ x, y }` (defaults to `{ x: 0, y: 0 }`).
   * @returns Observable emitting the newly created `WidgetResponse`.
   */
  provisionWidget(
    template: TemplateResponse,
    dashboardId: string,
    position: GridPosition = { x: 0, y: 0 },
  ): Observable<WidgetResponse> {
    const config = this.templateConfig.buildDefaultConfig(template);
    const vizType = this.templateConfig.inferVisualization(template);
    const subtitle = template.description?.trim() || undefined;
    const defaultH = vizType === 'table' ? 6 : vizType === 'bar_chart' || vizType === 'pie' ? 5 : 4;

    const payload: WidgetCreateSql = {
      title: template.title,
      ...(subtitle ? { subtitle } : {}),
      type: 'SQL',
      visualization: vizType,
      config: {
        ...config,
        ...(subtitle ? { subtitle, description: subtitle } : {}),
        x: position.x,
        y: position.y,
        w: 6,
        h: defaultH,
      },
    };

    return this.dashboardApi
      .createWidgetApiV1DashboardsDashboardIdWidgetsPost(dashboardId, payload)
      .pipe(
        map((widget) => {
          this.store.refreshWidget(widget.id);
          return widget;
        }),
      );
  }
}
