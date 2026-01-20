import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import {
  DashboardsService,
  TemplateResponse,
  WidgetIn,
  WidgetCreateSql, // Import subtype
  WidgetResponse,
  DashboardResponse
} from '../api-client';
import { DashboardStore } from '../dashboard/dashboard.store';

/**
 * Service responsible for instantiating Widgets from Templates.
 *
 * Handles the logic of:
 * 1. Extracting default values from the Template's JSON Schema.
 * 2. Compiling the SQL (Handlebars substitution).
 * 3. Persisting the new Widget to the API.
 */
@Injectable({
  providedIn: 'root'
})
export class ProvisioningService {
  private readonly dashboardApi = inject(DashboardsService);
  private readonly store = inject(DashboardStore);

  /**
   * Instantiates a template into the current dashboard using its default parameters.
   *
   * @param {TemplateResponse} template - The source template.
   * @param {string} dashboardId - The target dashboard UUID.
   * @param {object} position - Optional grid position {x, y}.
   * @returns {Observable<WidgetResponse>} The created widget.
   */
  provisionWidget(
    template: TemplateResponse,
    dashboardId: string,
    position: { x: number; y: number } = { x: 0, y: 0 }
  ): Observable<WidgetResponse> {

    // 1. Prepare Configuration
    const config = this.buildConfig(template);

    // Map grid position
    config['x'] = position.x;
    config['y'] = position.y;
    config['w'] = 6; // Default width
    config['h'] = 4; // Default height

    // Determine visualization type heuristics
    const vizType = this.guessVisualization(template);

    // Cast as SQL subtype for backend compat
    const payload: WidgetCreateSql = {
      title: template.title,
      type: 'SQL',
      visualization: vizType,
      config: { query: config['query'], ...config } as any
    };

    // 2. Call API & Update Store
    return this.dashboardApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(dashboardId, payload)
      .pipe(
        map(widget => {
          // Verify widget creation success
          // Trigger a refresh of the single widget to fetch data immediately
          this.store.refreshWidget(widget.id);
          // Reload dashboard to sync full layout state if needed
          // this.store.loadDashboard(dashboardId);
          return widget;
        })
      );
  }

  /**
   * Generates the widget configuration object by injecting schema defaults into the SQL.
   */
  private buildConfig(template: TemplateResponse): Record<string, any> {
    const rawSql = template.sql_template;
    const schema = template.parameters_schema || {};
    // Fix: Access properties safely via bracket notation or explicit typing
    const props = schema['properties'] || {};

    let processedSql = rawSql;

    // Iterate over schema properties to find defaults
    Object.keys(props).forEach(key => {
      const prop = props[key];
      if (prop.default !== undefined) {
        const val = String(prop.default);
        // Replace {{key}}
        processedSql = processedSql.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), val);
      }
    });

    return { query: processedSql };
  }

  /**
   * Heuristic to determine the best visualization based on title/SQL keywords.
   */
  private guessVisualization(template: TemplateResponse): string {
    const title = template.title.toLowerCase();
    const sql = template.sql_template.toLowerCase();

    if (title.includes('breakdown') || title.includes('share') || title.includes('mix')) {
      return 'pie';
    }
    if (title.includes('trend') || title.includes('over time') || sql.includes('group by')) {
      return 'bar_chart';
    }
    if (title.includes('probability') || title.includes('rate') || title.includes('risk')) {
      return 'scalar';
    }
    if (title.includes('gap') || title.includes('lag')) {
      return 'metric';
    }

    return 'table';
  }
}