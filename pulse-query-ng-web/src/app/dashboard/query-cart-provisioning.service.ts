/* v8 ignore start */
/** @docs */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DashboardsService, WidgetCreateSql, WidgetResponse } from '../api-client';
import { DashboardStore } from './dashboard.store';
import { QueryCartItem } from '../global/query-cart.models';
import { QueryCartService } from '../global/query-cart.service';

/**
 * Creates dashboard widgets from Query Cart items.
 * Orchestrates the conversion of ad-hoc SQL into persisted widgets.
 */
@Injectable({
  providedIn: 'root',
})
/** @docs */
export class QueryCartProvisioningService {
  /** dashboardsApi property. */
  private readonly dashboardsApi = inject(DashboardsService);
  /** store property. */
  private readonly store = inject(DashboardStore);
  /** cart property. */
  private readonly cart = inject(QueryCartService);

  /**
   * Adds a cart item to a dashboard as a SQL widget.
   *
   * @param item - Cart item to provision (contains SQL and Title).
   * @param dashboardId - Target dashboard id.
   * @returns Observable of the created widget.
   */
  addToDashboard(item: QueryCartItem, dashboardId: string): Observable<WidgetResponse> {
    // Construct valid SQL Widget Payload from Cart Item
    const payload: WidgetCreateSql = {
      title: item.title,
      type: 'SQL',
      visualization: 'table', // Default visualization for ad-hoc
      config: {
        query: item.sql,
        x: 0, // Placement logic handled by API defaults or layout manager
        y: 0,
        w: 6,
        h: 4,
      },
    };

    return this.dashboardsApi
      .createWidgetApiV1DashboardsDashboardIdWidgetsPost(dashboardId, payload)
      .pipe(
        map((widget) => {
          // 1. Refresh the specific widget immediately to show data
          this.store.refreshWidget(widget.id);

          // 2. Consume the item from the cart
          this.cart.remove(item.id);

          return widget;
        }),
      );
  }
}
