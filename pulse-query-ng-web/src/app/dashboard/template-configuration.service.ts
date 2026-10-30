/**
 * @fileoverview Shared service for parsing template parameter schemas, interpolating
 * `{{parameter}}` placeholders into SQL templates, and inferring default visualization types.
 */

import { Service } from '@angular/core';
import { TemplateResponse } from '../api-client';
import { narrowRecordPayload } from '../widget/widget-data.guards';

/**
 * Stateless helper service shared by `TemplateWizardComponent` and `ProvisioningService`.
 */
@Service()
export class TemplateConfigurationService {
  /**
   * Returns `true` when a JSON Schema object defines at least one property in `properties`.
   *
   * @param schema - Optional JSON Schema dictionary from a `TemplateResponse`.
   * @returns `true` if `schema.properties` is a non-empty object.
   */
  hasSchemaParameters(schema?: Record<string, unknown> | null): boolean {
    if (!schema || typeof schema !== 'object') {
      return false;
    }
    const props = narrowRecordPayload(schema['properties']);
    if (!props) {
      return false;
    }
    return Object.keys(props).length > 0;
  }

  /**
   * Extracts default parameter values declared inside a JSON Schema `properties` block.
   *
   * @param schema - Optional JSON Schema dictionary from a `TemplateResponse`.
   * @returns Map of parameter names to their schema `default` values.
   */
  extractDefaultParameters(schema?: Record<string, unknown> | null): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    if (!schema || typeof schema !== 'object') {
      return defaults;
    }
    const props = narrowRecordPayload(schema['properties']);
    if (!props) {
      return defaults;
    }
    for (const [key, propDef] of Object.entries(props)) {
      const defRecord = narrowRecordPayload(propDef);
      if (defRecord && defRecord['default'] !== undefined) {
        defaults[key] = defRecord['default'];
      }
    }
    return defaults;
  }

  /**
   * Substitutes `{{ key }}` placeholders in `sqlTemplate` with values from `params`.
   *
   * @param sqlTemplate - Raw DuckDB SQL string containing `{{param}}` placeholders.
   * @param params - Map of parameter names to substitution values.
   * @returns Interpolated SQL query string.
   */
  interpolateSql(sqlTemplate: string, params: Record<string, unknown>): string {
    let processedSql = sqlTemplate || '';
    for (const key of Object.keys(params)) {
      const val = params[key];
      if (val !== undefined && val !== null) {
        const pattern = new RegExp('\\{\\{\\s*' + key + '\\s*\\}\\}', 'g');
        processedSql = processedSql.replace(pattern, String(val));
      }
    }
    return processedSql;
  }

  /**
   * Builds a SQL widget configuration object for a template using its default parameter values.
   *
   * @param template - Source `TemplateResponse` definition.
   * @returns Configuration record containing the interpolated `query`.
   */
  buildDefaultConfig(template: TemplateResponse): { query: string } {
    const defaults = this.extractDefaultParameters(template.parameters_schema);
    return {
      query: this.interpolateSql(template.sql_template, defaults),
    };
  }

  /**
   * Infers the recommended visualization type (`pie`, `bar_chart`, `scalar`, `metric`, or `table`)
   * from a template's title and SQL keywords.
   *
   * @param template - Object containing `title` and `sql_template`.
   * @returns Recommended visualization identifier string.
   */
  inferVisualization(template: Pick<TemplateResponse, 'title' | 'sql_template'>): string {
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
